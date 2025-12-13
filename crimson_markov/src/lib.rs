/// Bun FFI library for Markov chain processing

// This code was written specifically for working around the
// these hardware constraints: 2 VCPU cores and 4 GB of RAM.
// Could be better, but this is the best and most efficient
// implementation I've tested with my VPS the bot is hosted on.

use fastrand::Rng;
use levenshtein::levenshtein;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json;
use std::borrow::Cow;
use ahash::{AHashMap, AHashSet};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr::{self, null_mut};
use std::str;
use std::cell::{RefCell, UnsafeCell};
use std::time::Instant;
use string_interner::{backend::StringBackend, StringInterner, symbol::SymbolUsize, Symbol};
use std::fmt::Write; // Import Write for efficient string appending

#[derive(Serialize)]
struct Timings {
    db_query_ms: f64,
    training_ms: f64,
    generation_ms: f64
}

#[derive(Serialize)]
struct GenerationResult {
    text: String,
    timings: Timings
}

#[derive(Deserialize)]
struct SimplifiedMessage {
    text: String,
    timestamp: i64,
}

struct MessageData {
    word_ids: Vec<u32>,
    original_text: String
}

type BigramMap = AHashMap<u32, AHashMap<u32, u32>>;
type TrigramMap = AHashMap<(u32, u32), AHashMap<u32, u32>>;
type TrigramInvertedStarters = AHashMap<u32, AHashSet<(u32, u32)>>;

struct ChainState {
    all_messages: Vec<MessageData>,
    bigram_chain: BigramMap,
    trigram_chain: TrigramMap,
    trigram_inverted_starters: TrigramInvertedStarters,
    bigram_starters: Vec<u32>,
    trigram_starters: Vec<(u32, u32)>,
    lowercase_word_interner: StringInterner<StringBackend<SymbolUsize>>,
    cased_word_interner: StringInterner<StringBackend<SymbolUsize>>,
    casing_map: AHashMap<u32, AHashMap<SymbolUsize, u32>>,
    cased_to_lower_map: AHashMap<SymbolUsize, u32>,
}

pub struct MarkovChain {
    state: RefCell<ChainState>,
    rng: UnsafeCell<Rng>,
}

static TOKENIZER_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"(?s)```[^`]*?```|",        // Multi-line code blocks
        r"`[^`]*?`|",                // Inline code
        r"<@[!&]?\d+>|",             // User and role mentions
        r"<#\d+>|",                  // Channel mentions
        r"@everyone|@here|",         // Everyone/here mentions
        r"<a?:\w+:\d+>|",            // Custom emojis
        r"\p{Emoji}+|",              // Unicode Emojis
        r"https?://[^\s<>]+|",       // URLs
        r"\[[^\]]+\]\([^\s<>)]+\)|", // Masked links
        r"\d+(?:[.,:']\d+)*%?|",     // Numbers with punctuation
        r"[\w]+(?:['\-+/]\w+)*|",    // Words with mixed symbols (apostrophes, hyphens, slashes, plus signs)
        r"~{2,}|",                   // Strikethrough
        r"\*{2,}|",                  // Bold
        r"_{2,}|",                   // Underline
        r"\*[^*]+\*|",               // Italics/actions
        r"\p{P}+|",                  // Punctuation
        r"[_>]"                      // Other markdown (quotes)
    ))
    .unwrap()
});

fn tokenize<'a>(text: &'a str) -> impl Iterator<Item = &'a str> {
    TOKENIZER_REGEX
        .find_iter(text)
        .map(|m| m.as_str())
}

#[no_mangle]
pub extern "C" fn create_chain() -> *mut MarkovChain {
    Box::into_raw(Box::new(MarkovChain {
        state: RefCell::new(ChainState {
            all_messages: Vec::new(),
            bigram_chain: AHashMap::new(),
            trigram_chain: AHashMap::new(),
            trigram_inverted_starters: AHashMap::new(),
            bigram_starters: Vec::new(),
            trigram_starters: Vec::new(),
            lowercase_word_interner: StringInterner::new(),
            cased_word_interner: StringInterner::new(),
            casing_map: AHashMap::new(),
            cased_to_lower_map: AHashMap::new(),
        }),
        rng: UnsafeCell::new(Rng::new()),
    }))
}

#[no_mangle]
pub extern "C" fn destroy_chain(ptr: *mut MarkovChain) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

fn intern_word_and_get_lower_id(state: &mut ChainState, word: &str) -> u32 {
    // 1. Intern the raw (cased) word
    let cased_id = state.cased_word_interner.get_or_intern(word);

    // 2. Check if we already mapped this cased ID to a lowercase ID
    let lower_id = if let Some(id) = state.cased_to_lower_map.get(&cased_id) {
        *id
    } else {
        // 3. If not, calculate lowercase and intern that
        let lower_word: Cow<str> = if word.chars().any(char::is_uppercase) {
            Cow::Owned(word.to_lowercase())
        } else {
            Cow::Borrowed(word)
        };
        let lower_id_symbol = state.lowercase_word_interner.get_or_intern(&*lower_word);
        let lower_id = lower_id_symbol.to_usize() as u32;
        
        // 4. Cache the mapping
        state.cased_to_lower_map.insert(cased_id, lower_id);
        lower_id
    };

    // 5. Update statistics for casing restoration later
    let case_counts = state.casing_map.entry(lower_id).or_default();
    *case_counts.entry(cased_id).or_insert(0) += 1;

    lower_id
}

#[no_mangle]
pub extern "C" fn train_on_batch(
    ptr: *mut MarkovChain,
    json_ptr: *const c_char,
) {
    if ptr.is_null() || json_ptr.is_null() {
        return;
    }
    let chain = unsafe { &*ptr };
    let json_str = unsafe { CStr::from_ptr(json_ptr).to_str().unwrap_or("[]") };

    let mut messages: Vec<SimplifiedMessage> = serde_json::from_str(json_str).unwrap_or_else(|e| {
        eprintln!("Failed to deserialize messages: {}", e);
        Vec::new()
    });

    if messages.is_empty() {
        return;
    }

    // Sort messages by timestamp to process them in chronological order
    messages.sort_by_key(|m| m.timestamp);

    let mut state = chain.state.borrow_mut();

    for message in messages {
        let tokens: Vec<&str> = tokenize(&message.text).collect();
        if tokens.is_empty() {
            continue;
        }

        let word_ids: Vec<u32> = tokens.iter().map(|&word| intern_word_and_get_lower_id(&mut state, word)).collect();

        // Add to all_messages for similarity search later
        state.all_messages.push(MessageData {
            word_ids: word_ids.clone(),
            original_text: message.text.clone()
        });

        // --- Standard Word-Level Chain Training ---
        if let Some(first_id) = word_ids.get(0) {
            state.bigram_starters.push(*first_id);
        }

        if let Some(pair) = word_ids.get(0..2) {
            state.trigram_starters.push((pair[0], pair[1]));
            state.bigram_chain.entry(pair[0]).or_default()
                .entry(pair[1]).and_modify(|v| *v += 1).or_insert(1);
        }

        for window in word_ids.windows(3) {
            let (p2, p1, id) = (window[0], window[1], window[2]);
            
            // Trigram
            let key = (p2, p1);
            state.trigram_chain.entry(key).or_default()
                .entry(id).and_modify(|v| *v += 1).or_insert(1);
                
            state.trigram_inverted_starters.entry(p2).or_default().insert(key);

            // Bigram
            state.bigram_chain.entry(p1).or_default()
                .entry(id).and_modify(|v| *v += 1).or_insert(1);
        }
    }
}

fn get_seed_ids(chain: &MarkovChain, seed_words: &[String]) -> Vec<u32> {
    let state = chain.state.borrow();
    seed_words
        .iter()
        .filter_map(|word| {
            let lower_word: Cow<str> = if word.chars().any(char::is_uppercase) {
                Cow::Owned(word.to_lowercase())
            } else {
                Cow::Borrowed(word)
            };
            state
                .lowercase_word_interner
                .get(&*lower_word)
                .map(|s| s.to_usize() as u32)
        })
        .collect()
}

fn choose_next_word(rng: &mut Rng, follower_counts: &AHashMap<u32, u32>) -> Option<u32> {
    let total_count: u64 = follower_counts.values().map(|&c| c as u64).sum();
    if total_count == 0 {
        return None;
    }
    let mut choice = rng.u64(..total_count);

    for (word_id, count) in follower_counts.iter() {
        if choice < (*count as u64) {
            return Some(*word_id);
        }
        choice -= *count as u64;
    }
    None
}

fn ids_to_string(chain: &MarkovChain, result_ids: &[u32]) -> String {
    if result_ids.is_empty() {
        return String::new();
    }

    let state = chain.state.borrow();

    // Pre-calculating a rough capacity estimation to reduce reallocations
    // Assuming avg word length of 5 + 1 space
    let mut result = String::with_capacity(result_ids.len() * 6);

    let get_word_str = |id: u32| -> Cow<'_, str> {
        if let Some(case_map) = state.casing_map.get(&id) {
            if let Some((cased_id, _)) = case_map.iter().max_by_key(|&(_, count)| count) {
                if let Some(word_str) = state.cased_word_interner.resolve(*cased_id) {
                    return Cow::Borrowed(word_str);
                }
            }
        }
        // Fallback if case mapping fails or word missing (safety)
        let symbol = SymbolUsize::try_from_usize(id as usize).unwrap();
        state
            .lowercase_word_interner
            .resolve(symbol)
            .map(Cow::Borrowed)
            .unwrap_or(Cow::Borrowed(""))
    };

    let right_sticky_punctuation: &[char] = &['.', ',', '!', '?', ';', ':', ')', ']', '}'];
    let left_sticky_punctuation: &[char] = &['(', '[', '{', '$'];
    let bi_directional_punctuation: &[char] = &['\'', '"'];

    let tokens: Vec<_> = result_ids.iter().map(|&id| get_word_str(id)).collect();

    if let Some(first_token) = tokens.first() {
        result.push_str(first_token);

        for i in 1..tokens.len() {
            let prev_token = &tokens[i - 1];
            let current_token = &tokens[i];

            let mut add_space = true;

            // Rule 1: No space if previous token ends with left-sticky punctuation.
            if let Some(c) = prev_token.chars().last() {
                if left_sticky_punctuation.contains(&c) || bi_directional_punctuation.contains(&c) {
                    add_space = false;
                }
            }

            // Rule 2: No space if current token starts with right-sticky punctuation.
            if let Some(c) = current_token.chars().next() {
                if right_sticky_punctuation.contains(&c) || bi_directional_punctuation.contains(&c) {
                    add_space = false;
                }
            }

            // Rule 3: Override for specific cases. Add a space if a word follows a right-sticky punctuation.
            // This allows for sentences like "Hello. World" instead of "Hello.World".
            if let (Some(prev_last), Some(curr_first)) = (prev_token.chars().last(), current_token.chars().next()) {
                if (right_sticky_punctuation.contains(&prev_last) || bi_directional_punctuation.contains(&prev_last)) && curr_first.is_alphanumeric() {
                    add_space = true;
                }
                 // Rule 4: Prevent space between two bi-directional punctuations (e.g., empty quotes "").
                if bi_directional_punctuation.contains(&prev_last) && bi_directional_punctuation.contains(&curr_first) {
                    add_space = false;
                }
            }


            if add_space {
                result.push(' ');
            }
            result.push_str(current_token);
        }
    }

    result
}

fn generate_bigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> String {
    let state = chain.state.borrow();

    if state.bigram_chain.is_empty() || state.bigram_starters.is_empty() {
        return String::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_word_id: u32 = 0;
    let mut seeded = false;

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let seed_ids = get_seed_ids(chain, &words);
            if !seed_ids.is_empty() {
                if let Some(last_seed_id) = seed_ids.last() {
                    if state.bigram_chain.contains_key(last_seed_id) {
                        result_ids = seed_ids.clone();
                        current_word_id = *last_seed_id;
                        seeded = true;
                    }
                }
            }
        }
    }

    // SAFETY: Single thread guarantee via Bun
    let rng = unsafe { &mut *chain.rng.get() };
    if !seeded {
        current_word_id = state.bigram_starters[rng.usize(..state.bigram_starters.len())];
        result_ids.push(current_word_id);
    }

    let words_to_generate = max_words.saturating_sub(result_ids.len());
    for _ in 0..words_to_generate {
        if let Some(follower_counts) = state.bigram_chain.get(&current_word_id) {
            if let Some(next_word_id) = choose_next_word(rng, follower_counts) {
                current_word_id = next_word_id;
                result_ids.push(current_word_id);
            } else {
                break;
            }
        } else {
            break;
        }
    }

    ids_to_string(chain, &result_ids)
}

fn generate_trigram(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> String {
    let state = chain.state.borrow();

    if state.trigram_chain.is_empty() || state.trigram_starters.is_empty() {
        return String::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_pair: (u32, u32) = (0, 0);
    let mut seeded = false;
    // SAFETY: Single thread guarantee
    let rng = unsafe { &mut *chain.rng.get() };

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let seed_ids = get_seed_ids(chain, &words);

            if !seed_ids.is_empty() {
                // Try seeding with the last two words if possible
                if seed_ids.len() >= 2 {
                    let key = (
                        seed_ids[seed_ids.len() - 2],
                        seed_ids[seed_ids.len() - 1],
                    );
                    if state.trigram_chain.contains_key(&key) {
                        result_ids = seed_ids.clone();
                        current_pair = key;
                        seeded = true;
                    }
                }

                if !seeded {
                    let last_seed_id = *seed_ids.last().unwrap();
                    if let Some(possible_starters_set) = state
                        .trigram_inverted_starters
                        .get(&last_seed_id)
                    {
                        if !possible_starters_set.is_empty() {
                            let possible_starters: Vec<&(u32, u32)> =
                                possible_starters_set.iter().collect();
                            let chosen_pair =
                                *possible_starters[rng.usize(..possible_starters.len())];

                            if seed_ids.len() == 1 {
                                result_ids.push(chosen_pair.0);
                                result_ids.push(chosen_pair.1);
                            } else {
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
        current_pair = state.trigram_starters[rng.usize(..state.trigram_starters.len())];
        result_ids.push(current_pair.0);
        result_ids.push(current_pair.1);
    }

    let words_to_generate = max_words.saturating_sub(result_ids.len());
    for _ in 0..words_to_generate {
        if let Some(follower_counts) = state.trigram_chain.get(&current_pair) {
            if let Some(next_word_id) = choose_next_word(rng, follower_counts) {
                result_ids.push(next_word_id);
                current_pair = (current_pair.1, next_word_id);
            } else {
                break;
            }
        } else {
            break;
        }
    }

    ids_to_string(chain, &result_ids)
}

fn generate_hybrid(
    chain: &MarkovChain,
    max_words: usize,
    seed_words: Option<Vec<String>>,
) -> String {
    let state = chain.state.borrow();

    if state.trigram_chain.is_empty()
        || state.bigram_chain.is_empty()
        || state.trigram_starters.is_empty()
    {
        return String::new();
    }
    let mut result_ids = Vec::with_capacity(max_words);
    let mut current_pair: (u32, u32) = (0, 0);
    let mut seeded = false;
    // SAFETY: Single thread guarantee
    let rng = unsafe { &mut *chain.rng.get() };

    if let Some(words) = seed_words {
        if !words.is_empty() {
            let seed_ids = get_seed_ids(chain, &words);

            if !seed_ids.is_empty() {
                if seed_ids.len() >= 2 {
                    let key = (
                        seed_ids[seed_ids.len() - 2],
                        seed_ids[seed_ids.len() - 1],
                    );
                    if state.trigram_chain.contains_key(&key) {
                        result_ids = seed_ids.clone();
                        current_pair = key;
                        seeded = true;
                    }
                }

                if !seeded {
                    let last_seed_id = *seed_ids.last().unwrap();
                    if let Some(possible_starters_set) = state
                        .trigram_inverted_starters
                        .get(&last_seed_id)
                    {
                        if !possible_starters_set.is_empty() {
                            let possible_starters: Vec<&(u32, u32)> =
                                possible_starters_set.iter().collect();
                            let chosen_pair =
                                *possible_starters[rng.usize(..possible_starters.len())];

                            if seed_ids.len() == 1 {
                                result_ids.push(chosen_pair.0);
                                result_ids.push(chosen_pair.1);
                            } else {
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
        current_pair = state.trigram_starters[rng.usize(..state.trigram_starters.len())];
        result_ids.push(current_pair.0);
        result_ids.push(current_pair.1);
    }

    let words_to_generate = max_words.saturating_sub(result_ids.len());
    for _ in 0..words_to_generate {
        let mut next_word_id: Option<u32> = None;

        // 1. Try trigram
        if let Some(follower_counts) = state.trigram_chain.get(&current_pair) {
            if !follower_counts.is_empty() {
                next_word_id = choose_next_word(rng, follower_counts);
            }
        }

        // 2. Fallback to bigram
        if next_word_id.is_none() {
            if let Some(follower_counts) = state.bigram_chain.get(&current_pair.1) {
                if !follower_counts.is_empty() {
                    next_word_id = choose_next_word(rng, follower_counts);
                }
            }
        }

        if let Some(id) = next_word_id {
            result_ids.push(id);
            current_pair = (current_pair.1, id);
        } else {
            // 3. Hybrid jump: if both fail, jump to a new random starter
            if !state.trigram_starters.is_empty() {
                current_pair = state.trigram_starters[rng.usize(..state.trigram_starters.len())];
                result_ids.push(current_pair.0);
                if result_ids.len() < max_words {
                    result_ids.push(current_pair.1);
                }
            } else {
                break;
            }
        }
    }

    ids_to_string(chain, &result_ids)
}

fn generate_chatbot_response(
    chain: &MarkovChain,
    max_words: usize,
    seed_text: &str,
) -> String {
    let state = chain.state.borrow();
    if state.all_messages.is_empty() {
        return String::new();
    }

    // 1. Find the most similar message
    let mut min_distance = usize::MAX;
    let mut best_match_index: Option<usize> = None;

    for (i, message_data) in state.all_messages.iter().enumerate() {
        let distance = levenshtein(&seed_text, &message_data.original_text);
        if distance < min_distance {
            min_distance = distance;
            best_match_index = Some(i);
        }
    }

    let best_match_index = match best_match_index {
        Some(index) => index,
        None => return String::new(), // Should not happen if all_messages is not empty
    };
    
    // 2. Find the message that was posted immediately after
    let reply_candidate_index = best_match_index + 1;
    if reply_candidate_index >= state.all_messages.len() {
        // The best match was the last message, so we can't find a reply.
        // Fallback: use a random starter.
        return generate_hybrid(chain, max_words, None);
    }
    
    let reply_candidate = &state.all_messages[reply_candidate_index];

    // 3. Take the first 2-3 words of the reply candidate as the new seed
    let new_seed_ids = &reply_candidate.word_ids;
    let seed_word_count = if new_seed_ids.len() >= 2 { 2 } else { new_seed_ids.len() };
    
    if seed_word_count == 0 {
        return generate_hybrid(chain, max_words, None);
    }

    let seed_words_as_strings: Vec<String> = new_seed_ids[..seed_word_count].iter().map(|&id| {
        let symbol = SymbolUsize::try_from_usize(id as usize).unwrap();
        state.lowercase_word_interner.resolve(symbol).unwrap().to_string()
    }).collect();

    // 4. Generate the rest of the message
    generate_hybrid(chain, max_words, Some(seed_words_as_strings))
}


#[no_mangle]
pub extern "C" fn generate_text(
    ptr: *mut MarkovChain,
    max_words: usize,
    mode: u8,
    seed_ptr: *const c_char,
    db_query_ms: f64,
    training_ms: f64,
    batch_size: usize
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
            Some(
                tokenize(seed_str)
                    .map(|s| s.to_string())
                    .collect()
            )
        }
    };

    let mut results = Vec::with_capacity(batch_size);
    
    for i in 0..batch_size {
        let start_time = Instant::now();
        let result_str = match mode {
            0 => generate_bigram(chain, max_words, seed_words.clone()),
            2 => generate_hybrid(chain, max_words, seed_words.clone()),
            _ => generate_trigram(chain, max_words, seed_words.clone()),
        };

        if !result_str.is_empty() {
            let generation_ms = start_time.elapsed().as_nanos() as f64 / 1_000_000.0;
            results.push(GenerationResult {
                text: result_str,
                timings: Timings {
                    db_query_ms: if i == 0 { db_query_ms } else { 0.0 },
                    training_ms: if i == 0 { training_ms } else { 0.0 },
                    generation_ms,
                },
            });
        }
    }

    if results.is_empty() {
        return null_mut();
    }

    // Optimization: Use a single pre-allocated buffer for JSON construction 
    // to avoid allocating multiple Strings via format!().
    let mut json_out = String::with_capacity(256 * results.len());
    
    if batch_size > 1 {
        json_out.push('[');
        for (i, r) in results.iter().enumerate() {
            if i > 0 { json_out.push(','); }
            
            // We must still use serde_json for the text content to ensure 
            // proper escaping of quotes, backslashes, etc.
            let escaped_text = serde_json::to_string(&r.text).unwrap();
            
            let _ = write!(
                json_out,
                r#"{{"text":{},"timings":{{"db_query_ms":{},"training_ms":{},"generation_ms":{}}}}}"#,
                escaped_text,
                r.timings.db_query_ms,
                r.timings.training_ms,
                r.timings.generation_ms
            );
        }
        json_out.push(']');
    } else {
        // Single object return for backwards compatibility / simplicity
        let r = &results[0];
        let escaped_text = serde_json::to_string(&r.text).unwrap();
        let _ = write!(
            json_out,
            r#"{{"text":{},"timings":{{"db_query_ms":{},"training_ms":{},"generation_ms":{}}}}}"#,
            escaped_text,
            r.timings.db_query_ms,
            r.timings.training_ms,
            r.timings.generation_ms
        );
    }

    CString::new(json_out).map_or(ptr::null_mut(), |s| s.into_raw())
}

#[no_mangle]
pub extern "C" fn generate_chat_response(
    ptr: *mut MarkovChain,
    max_words: usize,
    seed_ptr: *const c_char,
    db_query_ms: f64,
    training_ms: f64
) -> *mut c_char {
    if ptr.is_null() {
        return ptr::null_mut();
    }
    let chain = unsafe { &*ptr };
    let seed_str = unsafe { CStr::from_ptr(seed_ptr).to_str().unwrap_or("") };

    let start_time = Instant::now();
    let result_str = generate_chatbot_response(chain, max_words, seed_str);
    let generation_ms = start_time.elapsed().as_nanos() as f64 / 1_000_000.0;
    
    let result = GenerationResult {
        text: result_str,
        timings: Timings {
            db_query_ms,
            training_ms,
            generation_ms,
        },
    };

    let json_out = serde_json::to_string(&result).unwrap();
    CString::new(json_out).map_or(ptr::null_mut(), |s| s.into_raw())
}


#[no_mangle]
pub extern "C" fn free_text(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}
