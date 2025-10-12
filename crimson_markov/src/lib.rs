/// Bun FFI library for Markov chain processing

// This code was written specifically for working around the
// these hardware constraints: 2 VCPU cores and 4 GB of RAM.
// Could be better, but this is the best and most efficient
// implementation I've tested with my VPS the bot is hosted on.

use fastrand::Rng;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr::{self, null_mut};
use std::slice;
use std::str;
use std::cell::{RefCell, UnsafeCell};
use std::time::Instant;
use string_interner::{backend::StringBackend, StringInterner, symbol::SymbolUsize, Symbol};

#[derive(Serialize)]
struct Timings {
    db_query_ms: f64,
    training_ms: f64,
    generation_ms: f64,
}

#[derive(Serialize)]
struct GenerationResult {
    text: String,
    timings: Timings,
}

type BigramMap = HashMap<u32, Vec<u32>>;
type TrigramMap = HashMap<(u32, u32), Vec<u32>>;
type TrigramInvertedStarters = HashMap<u32, HashSet<(u32, u32)>>;

pub struct MarkovChain {
    bigram_chain: RefCell<BigramMap>,
    trigram_chain: RefCell<TrigramMap>,
    trigram_inverted_starters: RefCell<TrigramInvertedStarters>,
    bigram_starters: RefCell<Vec<u32>>,
    trigram_starters: RefCell<Vec<(u32, u32)>>,
    lowercase_word_interner: RefCell<StringInterner<StringBackend<SymbolUsize>>>,
    cased_word_interner: RefCell<StringInterner<StringBackend<SymbolUsize>>>,
    casing_map: RefCell<HashMap<u32, HashMap<SymbolUsize, u32>>>,
    rng: UnsafeCell<Rng>
}

impl MarkovChain {}

static HIGH_COMPLEXITY_TOKENIZER_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"(?s)```[^`]*?```|",      // Multi-line code blocks
        r"`[^`]*?`|",              // Inline code
        r"<@[!&]?\d+>|",           // User and role mentions
        r"<#\d+>|",                // Channel mentions
        r"@everyone|@here|",       // Everyone/here mentions
        r"<a?:\w+:\d+>|",          // Custom emojis
        r"\p{Emoji}+|",            // Unicode Emojis
        r"https?://[^\s]+|",       // URLs
        r"\[[^\]]+\]\([^\s)]+\)|", // Masked links
        r"\d+(?:[.,:']\d+)*%?|",   // Numbers with punctuation
        r"[\w]+(?:['\-+/]\w+)*|",  // Words with mixed symbols (apostrophes, hyphens, slashes, plus signs)
        r"\p{P}+|",                // Punctuation
        r"~{2,}|",                 // Strikethrough
        r"\*{2,}|",                // Bold
        r"_{2,}|",                 // Underline
        r"[*_>]"                   // Other markdown (italics, quotes)
    ))
    .unwrap()
});

fn tokenize<'a>(text: &'a str) -> Vec<&'a str> {
    HIGH_COMPLEXITY_TOKENIZER_REGEX
        .find_iter(text)
        .map(|m| m.as_str())
        .collect()
}

#[unsafe(no_mangle)]
pub extern "C" fn create_chain() -> *mut MarkovChain {
    Box::into_raw(Box::new(MarkovChain {
        bigram_chain: RefCell::new(HashMap::new()),
        trigram_chain: RefCell::new(HashMap::new()),
        trigram_inverted_starters: RefCell::new(HashMap::new()),
        bigram_starters: RefCell::new(Vec::new()),
        trigram_starters: RefCell::new(Vec::new()),
        lowercase_word_interner: RefCell::new(StringInterner::new()),
        cased_word_interner: RefCell::new(StringInterner::new()),
        casing_map: RefCell::new(HashMap::new()),
        rng: UnsafeCell::new(Rng::new())
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
pub extern "C" fn train_on_batch(
    ptr: *mut MarkovChain,
    texts_ptr: *const u8,
    texts_len: usize
) {
    if ptr.is_null() || texts_ptr.is_null() {
        return;
    }
    let chain = unsafe { &*ptr };

    let texts_slice = unsafe { slice::from_raw_parts(texts_ptr, texts_len) };
    let texts_str = match str::from_utf8(texts_slice) {
        Ok(s) => s,
        Err(_) => return, // Or handle error appropriately
    };

    let texts = texts_str.split('\0').filter(|s| !s.is_empty());

    // Acquire all locks at the beginning of the function
    let mut bigram_chain = chain.bigram_chain.borrow_mut();
    let mut trigram_chain = chain.trigram_chain.borrow_mut();
    let mut trigram_inverted_starters = chain.trigram_inverted_starters.borrow_mut();
    let mut bigram_starters = chain.bigram_starters.borrow_mut();
    let mut trigram_starters = chain.trigram_starters.borrow_mut();
    let mut lowercase_word_interner = chain.lowercase_word_interner.borrow_mut();
    let mut cased_word_interner = chain.cased_word_interner.borrow_mut();
    let mut casing_map = chain.casing_map.borrow_mut();

    for text in texts {
        let word_ids: Vec<u32> = tokenize(text)
            .into_iter()
            .map(|word| {
                // Inlined logic from intern_word_and_update_casing
                let lower_word: Cow<str> = if word.chars().any(char::is_uppercase) {
                    Cow::Owned(word.to_lowercase())
                } else {
                    Cow::Borrowed(word)
                };

                let id_symbol = lowercase_word_interner.get_or_intern(&*lower_word);
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
                trigram_inverted_starters
                    .entry(word_ids[i])
                    .or_default()
                    .insert(key);
            }
        }
    }
}

fn generate_bigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> String {
    let bigram_chain = chain.bigram_chain.borrow();
    let bigram_starters = chain.bigram_starters.borrow();

    if bigram_chain.is_empty() || bigram_starters.is_empty() {
        return String::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_word_id: u32 = 0;
    let mut seeded = false;

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let lowercase_word_interner = chain.lowercase_word_interner.borrow();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| {
                    let lower_word: Cow<str> = if word.chars().any(char::is_uppercase) {
                        Cow::Owned(word.to_lowercase())
                    } else {
                        Cow::Borrowed(word)
                    };
                    lowercase_word_interner
                        .get(&*lower_word)
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

    // SAFETY: It's guaranteed that `generate_text` is only called from a single thread.
    // Therefore, we can safely get a mutable reference to the RNG.
    let rng = unsafe { &mut *chain.rng.get() };
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

    if result_ids.is_empty() {
        return String::new();
    }

    let casing_map = chain.casing_map.borrow();
    let cased_word_interner = chain.cased_word_interner.borrow();
    let lowercase_word_interner = chain.lowercase_word_interner.borrow();

    let get_word_str = |id: u32| -> Cow<'_, str> {
        if let Some(case_map) = casing_map.get(&id) {
            if let Some((cased_id, _)) = case_map.iter().max_by_key(|&(_, count)| count) {
                if let Some(word_str) = cased_word_interner.resolve(*cased_id) {
                    return Cow::Borrowed(word_str);
                }
            }
        }
        let symbol = SymbolUsize::try_from_usize(id as usize).unwrap();
        lowercase_word_interner
            .resolve(symbol)
            .map(Cow::Borrowed)
            .unwrap_or(Cow::Borrowed(""))
    };

    let mut result = String::new();
    let punctuation: &[char] = &[
        '.', ',', '!', '?', ';', ':', '\'', '"', '(', ')', '[', ']', '{', '}',
    ];

    let mut tokens_iter = result_ids.iter().map(|&id| get_word_str(id));

    if let Some(first_token) = tokens_iter.next() {
        result.push_str(&first_token);
        for token in tokens_iter {
            if let Some(first_char) = token.chars().next() {
                if !punctuation.contains(&first_char) {
                    result.push(' ');
                }
            } else {
                result.push(' ');
            }
            result.push_str(&token);
        }
    }

    result
}

fn generate_trigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> String {
    let trigram_chain = chain.trigram_chain.borrow();
    let trigram_starters = chain.trigram_starters.borrow();

    if trigram_chain.is_empty() || trigram_starters.is_empty() {
        return String::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_pair: (u32, u32) = (0, 0);
    let mut seeded = false;
    // SAFETY: It's guaranteed that `generate_text` is only called from a single thread.
    // Therefore, we can safely get a mutable reference to the RNG.
    let rng = unsafe { &mut *chain.rng.get() };

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let lowercase_word_interner = chain.lowercase_word_interner.borrow();
            let seed_ids: Vec<u32> = words
                .iter()
                .filter_map(|word| {
                    let lower_word: Cow<str> = if word.chars().any(char::is_uppercase) {
                        Cow::Owned(word.to_lowercase())
                    } else {
                        Cow::Borrowed(word)
                    };
                    lowercase_word_interner
                        .get(&*lower_word)
                        .map(|s| s.to_usize() as u32)
                })
                .collect();

            if !seed_ids.is_empty() {
                // Try seeding with the last two words if possible
                if seed_ids.len() >= 2 {
                    let key = (
                        seed_ids[seed_ids.len() - 2],
                        seed_ids[seed_ids.len() - 1],
                    );
                    if trigram_chain.contains_key(&key) {
                        result_ids = seed_ids.clone();
                        current_pair = key;
                        seeded = true;
                    }
                }

                if !seeded {
                    let last_seed_id = *seed_ids.last().unwrap();
                    let trigram_inverted_starters =
                        chain.trigram_inverted_starters.borrow();
                    if let Some(possible_starters_set) =
                        trigram_inverted_starters.get(&last_seed_id)
                    {
                        if !possible_starters_set.is_empty() {
                            let possible_starters: Vec<&(u32, u32)> =
                                possible_starters_set.iter().collect();
                            let chosen_pair =
                                *possible_starters[rng.usize(..possible_starters.len())];

                            if seed_ids.len() == 1 {
                                // If the original seed was just one word, the result starts with the new pair.
                                result_ids.push(chosen_pair.0);
                                result_ids.push(chosen_pair.1);
                            } else {
                                // Otherwise, append the next word to the original seed.
                                result_ids = seed_ids.clone();
                                result_ids.push(chosen_pair.1);
                            }

                            current_pair = (
                                *result_ids.get(result_ids.len() - 2).unwrap(),
                                *result_ids.last().unwrap(),
                            );
                            seeded = true;
                        }
                    }
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

    if result_ids.is_empty() {
        return String::new();
    }

    let casing_map = chain.casing_map.borrow();
    let cased_word_interner = chain.cased_word_interner.borrow();
    let lowercase_word_interner = chain.lowercase_word_interner.borrow();

    let get_word_str = |id: u32| -> Cow<'_, str> {
        if let Some(case_map) = casing_map.get(&id) {
            if let Some((cased_id, _)) = case_map.iter().max_by_key(|&(_, count)| count) {
                if let Some(word_str) = cased_word_interner.resolve(*cased_id) {
                    return Cow::Borrowed(word_str);
                }
            }
        }
        let symbol = SymbolUsize::try_from_usize(id as usize).unwrap();
        lowercase_word_interner
            .resolve(symbol)
            .map(Cow::Borrowed)
            .unwrap_or(Cow::Borrowed(""))
    };

    let mut result = String::new();
    let punctuation: &[char] = &[
        '.', ',', '!', '?', ';', ':', '\'', '"', '(', ')', '[', ']', '{', '}',
    ];

    let mut tokens_iter = result_ids.iter().map(|&id| get_word_str(id));

    if let Some(first_token) = tokens_iter.next() {
        result.push_str(&first_token);
        for token in tokens_iter {
            if let Some(first_char) = token.chars().next() {
                if !punctuation.contains(&first_char) {
                    result.push(' ');
                }
            } else {
                result.push(' ');
            }
            result.push_str(&token);
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
    db_query_ms: f64,
    training_ms: f64,
) -> *mut c_char {
    if ptr.is_null() {
        return ptr::null_mut();
    }
    let start_time = Instant::now();
    let chain = unsafe { &*ptr };
    
    let seed_words = if seed_ptr.is_null() {
        None
    } else {
        let seed_str = unsafe { CStr::from_ptr(seed_ptr).to_str().unwrap() };
        if seed_str.is_empty() {
            None
        } else {
            Some(
                tokenize(seed_str)
                    .into_iter()
                    .map(|s| s.to_string())
                    .collect(),
            )
        }
    };

    let result_str = if mode == 0 {
        generate_bigram(chain, max_words, seed_words)
    } else {
        generate_trigram(chain, max_words, seed_words)
    };

    if result_str.is_empty() {
        return null_mut();
    }

    let generation_ms = start_time.elapsed().as_micros() as f64 / 1_000.0;

    let result = GenerationResult {
        text: result_str,
        timings: Timings {
            db_query_ms,
            training_ms,
            generation_ms,
        },
    };

    let json_result = serde_json::to_string(&result).unwrap();
    CString::new(json_result).map_or(ptr::null_mut(), |s| s.into_raw())
}

#[unsafe(no_mangle)]
pub extern "C" fn free_text(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}
