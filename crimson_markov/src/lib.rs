use fastrand::Rng;
use lazy_static::lazy_static;
use rayon::prelude::*;
use regex::Regex;
use serde_json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr::{self, null_mut};
use std::sync::{Mutex, RwLock};
use string_interner::{backend::StringBackend, StringInterner, symbol::SymbolUsize};

type BigramMap = HashMap<u32, Vec<u32>>;
type TrigramMap = HashMap<(u32, u32), Vec<u32>>;

pub struct MarkovChain {
    bigram_chain: RwLock<BigramMap>,
    trigram_chain: RwLock<TrigramMap>,
    bigram_starters: RwLock<Vec<u32>>,
    trigram_starters: RwLock<Vec<(u32, u32)>>,
    words_to_ids: RwLock<HashMap<String, u32>>,
    ids_to_words: RwLock<Vec<String>>,
    cased_word_interner: RwLock<StringInterner<StringBackend<SymbolUsize>>>,
    casing_map: RwLock<HashMap<u32, HashMap<SymbolUsize, u32>>>,
    rng: Mutex<Rng>,
}

#[derive(Default)]
struct ParallelTrainingData {
    bigram_starters: Vec<String>,
    trigram_starters: Vec<(String, String)>,
    bigrams: HashMap<String, Vec<String>>,
    trigrams: HashMap<(String, String), Vec<String>>,
    casing_prefs: HashMap<String, HashMap<String, usize>>,
}

impl ParallelTrainingData {
    fn merge(&mut self, other: ParallelTrainingData) {
        self.bigram_starters.extend(other.bigram_starters);
        self.trigram_starters.extend(other.trigram_starters);
        for (key, values) in other.bigrams {
            self.bigrams.entry(key).or_default().extend(values);
        }
        for (key, values) in other.trigrams {
            self.trigrams.entry(key).or_default().extend(values);
        }
        for (lower, other_case_map) in other.casing_prefs {
            let self_case_map = self.casing_prefs.entry(lower).or_default();
            for (original, count) in other_case_map {
                *self_case_map.entry(original).or_default() += count;
            }
        }
    }
}

lazy_static! {
    static ref TOKEN_REGEX: Regex =
        Regex::new(r#"(https?://[^\s]+)|(\w+('\w+)*)|([.,!?;:"'()\[\]{}])"#).unwrap();
}

fn tokenize(text: &str) -> Vec<String> {
    TOKEN_REGEX
        .find_iter(text)
        .map(|mat| mat.as_str().to_string())
        .collect()
}

#[unsafe(no_mangle)]
pub extern "C" fn create_chain() -> *mut MarkovChain {
    Box::into_raw(Box::new(MarkovChain {
        bigram_chain: RwLock::new(HashMap::new()),
        trigram_chain: RwLock::new(HashMap::new()),
        bigram_starters: RwLock::new(Vec::new()),
        trigram_starters: RwLock::new(Vec::new()),
        words_to_ids: RwLock::new(HashMap::new()),
        ids_to_words: RwLock::new(Vec::new()),
        cased_word_interner: RwLock::new(StringInterner::new()),
        casing_map: RwLock::new(HashMap::new()),
        rng: Mutex::new(Rng::new()),
    }))
}

#[unsafe(no_mangle)]
pub extern "C" fn destroy_chain(ptr: *mut MarkovChain) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn train_on_batch(ptr: *mut MarkovChain, texts_json_ptr: *const c_char) {
    if ptr.is_null() || texts_json_ptr.is_null() {
        return;
    }
    let chain = unsafe { &*ptr };
    let texts_json = unsafe { CStr::from_ptr(texts_json_ptr).to_str().unwrap() };

    let texts: Vec<String> = match serde_json::from_str(texts_json) {
        Ok(texts) => texts,
        Err(_) => return,
    };

    if texts.is_empty() {
        return;
    }

    // 1. Process texts in parallel to collect string-based data
    let batch_data = texts
        .par_iter()
        .map(|text| {
            let mut data = ParallelTrainingData::default();
            if text.is_empty() {
                return data;
            }

            let words: Vec<String> = TOKEN_REGEX
                .find_iter(text)
                .map(|m| m.as_str().to_string())
                .collect();
            if words.is_empty() {
                return data;
            }

            // Populate casing preferences
            for word in &words {
                let lower = word.to_lowercase();
                *data
                    .casing_prefs
                    .entry(lower)
                    .or_default()
                    .entry(word.clone())
                    .or_default() += 1;
            }

            // Create lowercase versions for chain keys/values
            let lower_words: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();

            if lower_words.len() >= 2 {
                data.bigram_starters.push(lower_words[0].clone());
                for i in 0..(lower_words.len() - 1) {
                    data.bigrams
                        .entry(lower_words[i].clone())
                        .or_default()
                        .push(lower_words[i + 1].clone());
                }
            }

            if lower_words.len() >= 3 {
                data.trigram_starters
                    .push((lower_words[0].clone(), lower_words[1].clone()));
                for i in 0..(lower_words.len() - 2) {
                    let key = (lower_words[i].clone(), lower_words[i + 1].clone());
                    data.trigrams
                        .entry(key)
                        .or_default()
                        .push(lower_words[i + 2].clone());
                }
            }
            data
        })
        .reduce(ParallelTrainingData::default, |mut acc, data| {
            acc.merge(data);
            acc
        });

    // 2. Now, acquire locks and update the main chain state
    let mut words_to_ids = chain.words_to_ids.write().unwrap();
    let mut ids_to_words = chain.ids_to_words.write().unwrap();
    let mut cased_word_interner = chain.cased_word_interner.write().unwrap();
    let mut casing_map = chain.casing_map.write().unwrap();

    // Helper function to get or create word ID
    let mut get_or_create_id = |word: &str| -> u32 {
        *words_to_ids.entry(word.to_string()).or_insert_with(|| {
            let new_id = ids_to_words.len() as u32;
            ids_to_words.push(word.to_string());
            new_id
        })
    };

    // Update casing map and intern words
    for (lower, case_map_update) in batch_data.casing_prefs {
        let id = get_or_create_id(&lower);
        let main_case_map = casing_map.entry(id).or_default();
        for (original, count) in case_map_update {
            let cased_id = cased_word_interner.get_or_intern(original);
            *main_case_map.entry(cased_id).or_default() += count as u32;
        }
    }

    // Update bigram chain
    let mut bigram_chain = chain.bigram_chain.write().unwrap();
    let mut bigram_starters = chain.bigram_starters.write().unwrap();
    for starter in batch_data.bigram_starters {
        bigram_starters.push(get_or_create_id(&starter));
    }
    for (key, values) in batch_data.bigrams {
        let key_id = get_or_create_id(&key);
        let value_ids: Vec<u32> = values.iter().map(|v| get_or_create_id(v)).collect();
        bigram_chain.entry(key_id).or_default().extend(value_ids);
    }

    // Update trigram chain
    let mut trigram_chain = chain.trigram_chain.write().unwrap();
    let mut trigram_starters = chain.trigram_starters.write().unwrap();
    for (s1, s2) in batch_data.trigram_starters {
        trigram_starters.push((get_or_create_id(&s1), get_or_create_id(&s2)));
    }
    for (key, values) in batch_data.trigrams {
        let key_id = (get_or_create_id(&key.0), get_or_create_id(&key.1));
        let value_ids: Vec<u32> = values.iter().map(|v| get_or_create_id(v)).collect();
        trigram_chain.entry(key_id).or_default().extend(value_ids);
    }
}

fn get_preferred_casing(chain: &MarkovChain, id: u32) -> String {
    let casing_map = chain.casing_map.read().unwrap();
    if let Some(case_map) = casing_map.get(&id) {
        if let Some((cased_id, _)) = case_map.iter().max_by_key(|&(_, count)| count) {
            let cased_word_interner = chain.cased_word_interner.read().unwrap();
            if let Some(word_str) = cased_word_interner.resolve(*cased_id) {
                return word_str.to_string();
            }
        }
    }
    let ids_to_words = chain.ids_to_words.read().unwrap();
    ids_to_words
        .get(id as usize)
        .cloned()
        .unwrap_or_default()
}

fn generate_bigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> Vec<String> {
    let bigram_chain = chain.bigram_chain.read().unwrap();
    let bigram_starters = chain.bigram_starters.read().unwrap();

    if bigram_chain.is_empty() || bigram_starters.is_empty() {
        return Vec::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_word_id: u32 = 0;
    let mut seeded = false;

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let words_to_ids = chain.words_to_ids.read().unwrap();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| words_to_ids.get(&word.to_lowercase()).cloned())
                .collect();
            if !seed_ids.is_empty() {
                if let Some(last_seed_id) = seed_ids.last() {
                    if bigram_chain.contains_key(last_seed_id) {
                        result_ids = seed_ids.clone();
                        current_word_id = *last_seed_id;
                        seeded = true;
                    }
                }
            }
        }
    }

    let mut rng = chain.rng.lock().unwrap();
    if !seeded {
        current_word_id = bigram_starters[rng.usize(..bigram_starters.len())];
        result_ids.push(current_word_id);
    }

    let words_to_generate = max_words.saturating_sub(result_ids.len());
    for _ in 0..words_to_generate {
        if let Some(next_word_ids) = bigram_chain.get(&current_word_id) {
            if next_word_ids.is_empty() {
                break;
            }
            current_word_id = next_word_ids[rng.usize(..next_word_ids.len())];
            result_ids.push(current_word_id);
        } else {
            break;
        }
    }

    result_ids
        .iter()
        .map(|id| get_preferred_casing(chain, *id))
        .collect()
}

fn generate_trigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> Vec<String> {
    let trigram_chain = chain.trigram_chain.read().unwrap();
    let trigram_starters = chain.trigram_starters.read().unwrap();

    if trigram_chain.is_empty() || trigram_starters.is_empty() {
        return Vec::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_pair: (u32, u32) = (0, 0);
    let mut seeded = false;
    let mut rng = chain.rng.lock().unwrap();

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let words_to_ids = chain.words_to_ids.read().unwrap();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| words_to_ids.get(&word.to_lowercase()).cloned())
                .collect();
            if seed_ids.len() >= 2 {
                let key = (seed_ids[seed_ids.len() - 2], seed_ids[seed_ids.len() - 1]);
                if trigram_chain.contains_key(&key) {
                    result_ids = seed_ids;
                    current_pair = key;
                    seeded = true;
                }
            } else if seed_ids.len() == 1 {
                let seed_id = seed_ids[0];
                let possible_starters: Vec<&(u32, u32)> = trigram_chain
                    .keys()
                    .filter(|(id1, _)| *id1 == seed_id)
                    .collect();
                if !possible_starters.is_empty() {
                    current_pair =
                        *possible_starters[rng.usize(..possible_starters.len())];
                    result_ids.push(current_pair.0);
                    result_ids.push(current_pair.1);
                    seeded = true;
                }
            }
        }
    }

    if !seeded {
        current_pair = trigram_starters[rng.usize(..trigram_starters.len())];
        result_ids.push(current_pair.0);
        result_ids.push(current_pair.1);
    }

    let words_to_generate = max_words.saturating_sub(result_ids.len());
    for _ in 0..words_to_generate {
        if let Some(next_word_ids) = trigram_chain.get(&current_pair) {
            if next_word_ids.is_empty() {
                break;
            }
            let next_word_id = next_word_ids[rng.usize(..next_word_ids.len())];
            result_ids.push(next_word_id);
            current_pair = (current_pair.1, next_word_id);
        } else {
            break;
        }
    }

    result_ids
        .iter()
        .map(|id| get_preferred_casing(chain, *id))
        .collect()
}

fn join_tokens(tokens: &[String]) -> String {
    let mut result = String::new();
    if tokens.is_empty() {
        return result;
    }

    let punctuation: &[char] = &['.', ',', '!', '?', ';', ':', '\'', '"', '(', ')', '[', ']', '{', '}'];

    for i in 0..tokens.len() {
        let token = &tokens[i];
        result.push_str(token);

        if i < tokens.len() - 1 {
            let next_token = &tokens[i + 1];
            if let Some(first_char) = next_token.chars().next() {
                if !punctuation.contains(&first_char) {
                    result.push(' ');
                }
            } else {
                result.push(' '); // space if next token is empty
            }
        }
    }
    result
}

#[unsafe(no_mangle)]
pub extern "C" fn generate_text(
    ptr: *mut MarkovChain,
    max_words: usize,
    mode: u8,
    seed_ptr: *const c_char,
) -> *mut c_char { // Changed to return *mut c_char
    if ptr.is_null() {
        return ptr::null_mut();
    }
    let chain = unsafe { &*ptr };
    let seed_words = if seed_ptr.is_null() {
        None
    } else {
        let seed_str = unsafe { CStr::from_ptr(seed_ptr).to_str().unwrap() };
        if seed_str.is_empty() {
            None
        } else {
            Some(tokenize(seed_str))
        }
    };

    let result_words: Vec<String> = if mode == 0 {
        generate_bigram(chain, max_words, seed_words)
    } else {
        generate_trigram(chain, max_words, seed_words)
    };

    if result_words.is_empty() {
        return null_mut();
    }
    let result_str = join_tokens(&result_words);
    CString::new(result_str).map_or(ptr::null_mut(), |s| s.into_raw())
}


#[unsafe(no_mangle)]
pub extern "C" fn free_text(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}
