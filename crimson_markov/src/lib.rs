use fastrand::Rng;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr::{self, null_mut};
use std::sync::{Mutex, RwLock};
use string_interner::{backend::StringBackend, StringInterner, symbol::SymbolUsize, Symbol};

type BigramMap = HashMap<u32, Vec<u32>>;
type TrigramMap = HashMap<(u32, u32), Vec<u32>>;

pub struct MarkovChain {
    bigram_chain: RwLock<BigramMap>,
    trigram_chain: RwLock<TrigramMap>,
    bigram_starters: RwLock<Vec<u32>>,
    trigram_starters: RwLock<Vec<(u32, u32)>>,
    lowercase_word_interner: RwLock<StringInterner<StringBackend<SymbolUsize>>>,
    cased_word_interner: RwLock<StringInterner<StringBackend<SymbolUsize>>>,
    casing_map: RwLock<HashMap<u32, HashMap<SymbolUsize, u32>>>,
    rng: Mutex<Rng>
}

impl MarkovChain {} 

/// A custom tokenizer that is faster than the regex-based one.
/// It handles URLs, words (including contractions), and specific punctuation.
fn custom_tokenize(text: &str) -> Vec<&str> {
    let mut tokens = Vec::new();
    let mut last_pos = 0;

    while last_pos < text.len() {
        // Find the start of the next token (skip whitespace)
        let start_pos = match text[last_pos..].find(|c: char| !c.is_whitespace()) {
            Some(pos) => last_pos + pos,
            None => break // No more non-whitespace characters
        };

        let remaining = &text[start_pos..];
        let first_char = remaining.chars().next().unwrap();
        let end_pos;

        // URLs
        if remaining.starts_with("http") {
            end_pos = remaining
                .find(char::is_whitespace)
                .map_or(text.len(), |i| start_pos + i);
        }
        // Words
        else if first_char.is_alphanumeric() {
            let mut end_word_pos = 0;
            let mut chars = remaining.char_indices().peekable();
            while let Some((i, c)) = chars.next() {
                if c.is_alphanumeric() {
                    end_word_pos = i + c.len_utf8();
                } else if c == '\'' { // please stop editing this, this is `char` (single quotes) not `&str` (double quotes)
                    if let Some((_, next_c)) = chars.peek() {
                        if next_c.is_alphanumeric() {
                            // This is an apostrophe inside a word, continue
                            continue;
                        }
                    }
                    // Apostrophe at the end or followed by non-alphanumeric, break
                    break;
                } else {
                    // Not part of a word
                    break;
                }
            }
            end_pos = start_pos + end_word_pos;
        }
        // Punctuation
        else if ".,!?;:\"'()[]{}".contains(first_char) {
            end_pos = start_pos + first_char.len_utf8();
        }
        // Unmatched character, skip it
        else {
            last_pos = start_pos + first_char.len_utf8();
            continue;
        }

        tokens.push(&text[start_pos..end_pos]);
        last_pos = end_pos;
    }
    tokens
}

fn tokenize(text: &str) -> Vec<String> {
    custom_tokenize(text)
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

#[unsafe(no_mangle)]
pub extern "C" fn create_chain() -> *mut MarkovChain {
    Box::into_raw(Box::new(MarkovChain {
        bigram_chain: RwLock::new(HashMap::new()),
        trigram_chain: RwLock::new(HashMap::new()),
        bigram_starters: RwLock::new(Vec::new()),
        trigram_starters: RwLock::new(Vec::new()),
        lowercase_word_interner: RwLock::new(StringInterner::new()),
        cased_word_interner: RwLock::new(StringInterner::new()),
        casing_map: RwLock::new(HashMap::new()),
        rng: Mutex::new(Rng::new())
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
pub extern "C" fn train_on_batch(ptr: *mut MarkovChain, texts_ptr: *const c_char) {
    if ptr.is_null() || texts_ptr.is_null() {
        return;
    }
    let chain = unsafe { &*ptr };
    let texts_str = unsafe { CStr::from_ptr(texts_ptr).to_str().unwrap() };

    // Avoid JSON deserialization by splitting the string by null characters.
    let texts = texts_str.split('\0').filter(|s| !s.is_empty());

    // Acquire all locks at the beginning of the function
    let mut bigram_chain = chain.bigram_chain.write().unwrap();
    let mut trigram_chain = chain.trigram_chain.write().unwrap();
    let mut bigram_starters = chain.bigram_starters.write().unwrap();
    let mut trigram_starters = chain.trigram_starters.write().unwrap();
    let mut lowercase_word_interner = chain.lowercase_word_interner.write().unwrap();
    let mut cased_word_interner = chain.cased_word_interner.write().unwrap();
    let mut casing_map = chain.casing_map.write().unwrap();

    for text in texts {
        let word_ids: Vec<u32> = custom_tokenize(text)
            .into_iter()
            .map(|word| {
                // Inlined logic from intern_word_and_update_casing
                let lower_word = word.to_lowercase();

                let id_symbol = lowercase_word_interner.get_or_intern(lower_word.as_str());
                let id = id_symbol.to_usize() as u32;

                let cased_id = cased_word_interner.get_or_intern(word);
                let case_counts = casing_map.entry(id).or_default();
                *case_counts.entry(cased_id).or_insert(0) += 1;

                id
            })
            .collect();

        if word_ids.is_empty() {
            continue;
        }

        if word_ids.len() >= 2 {
            bigram_starters.push(word_ids[0]);
            for i in 0..(word_ids.len() - 1) {
                bigram_chain
                    .entry(word_ids[i])
                    .or_default()
                    .push(word_ids[i + 1]);
            }
        }

        if word_ids.len() >= 3 {
            trigram_starters.push((word_ids[0], word_ids[1]));
            for i in 0..(word_ids.len() - 2) {
                let key = (word_ids[i], word_ids[i + 1]);
                trigram_chain
                    .entry(key)
                    .or_default()
                    .push(word_ids[i + 2]);
            }
        }
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
    let lowercase_word_interner = chain.lowercase_word_interner.read().unwrap();
    let symbol = SymbolUsize::try_from_usize(id as usize).unwrap();
    lowercase_word_interner
        .resolve(symbol)
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn generate_bigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>
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
            let lowercase_word_interner = chain.lowercase_word_interner.read().unwrap();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| {
                    lowercase_word_interner
                        .get(word.to_lowercase().as_str())
                        .map(|s| s.to_usize() as u32)
                })
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
    seed_words: Option<Vec<String>>
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
            let lowercase_word_interner = chain.lowercase_word_interner.read().unwrap();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| {
                    lowercase_word_interner
                        .get(word.to_lowercase().as_str())
                        .map(|s| s.to_usize() as u32)
                })
                .collect();
            if seed_ids.len() >= 2 {
                let key = (
                    seed_ids[seed_ids.len() - 2],
                    seed_ids[seed_ids.len() - 1]
                );
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
                    current_pair = *possible_starters[rng.usize(..possible_starters.len())];
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
    seed_ptr: *const c_char
) -> *mut c_char {
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
