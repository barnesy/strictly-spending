pub mod rule_miner;
pub mod recurrence;
pub mod forecast;
pub mod sort_queue;
pub mod projection;

use crate::db::CategoryRule;

pub struct PreparedRule<'a> {
    pub rule: &'a CategoryRule,
    pub norm_pattern: String,
}

pub fn normalize_for_match(s: &str) -> String {
    let mut cleaned = s.to_lowercase();
    for pattern in &["co id:", "des:", "id:", "indn:", "ref:"] {
        if cleaned.contains(pattern) {
            cleaned = cleaned.replace(pattern, " ");
        }
    }
    let mut result = String::with_capacity(cleaned.len());
    let mut last_was_space = true;
    for c in cleaned.chars() {
        if matches!(c, '*' | '.' | '/' | '&' | '-' | '#' | '+' | ',' | '_') || c.is_whitespace() {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(c);
            last_was_space = false;
        }
    }
    if result.ends_with(' ') {
        result.pop();
    }
    result
}

pub fn matches_normalized_rule(norm_text: &str, norm_pattern: &str) -> bool {
    if norm_pattern.is_empty() || norm_pattern.len() > norm_text.len() {
        return false;
    }
    let t = norm_text.as_bytes();
    let p_len = norm_pattern.len();
    for (i, _) in norm_text.match_indices(norm_pattern) {
        let start_ok = i == 0 || t[i - 1] == b' ';
        let end_ok = (i + p_len == t.len()) || t[i + p_len] == b' ';
        if start_ok && end_ok {
            return true;
        }
    }
    false
}

pub fn prepare_rules(rules: &[CategoryRule]) -> Vec<PreparedRule<'_>> {
    let mut prepared: Vec<PreparedRule<'_>> = rules
        .iter()
        .filter_map(|r| {
            let norm_pattern = normalize_for_match(&r.pattern);
            if norm_pattern.is_empty() {
                None
            } else {
                Some(PreparedRule { rule: r, norm_pattern })
            }
        })
        .collect();

    // Sort by priority DESC, then norm_pattern length DESC, then id DESC so newer rules win ties
    prepared.sort_by(|a, b| {
        b.rule
            .priority
            .cmp(&a.rule.priority)
            .then_with(|| b.norm_pattern.len().cmp(&a.norm_pattern.len()))
            .then_with(|| b.rule.id.unwrap_or(0).cmp(&a.rule.id.unwrap_or(0)))
    });

    prepared
}

pub fn match_best_prepared_rule<'a>(
    description: &str,
    merchant_key: &str,
    prepared_rules: &[PreparedRule<'a>],
) -> Option<&'a CategoryRule> {
    let desc_norm = normalize_for_match(description);
    let mkey_norm = if merchant_key.is_empty() {
        String::new()
    } else {
        normalize_for_match(merchant_key)
    };

    for pr in prepared_rules {
        let matched = (!desc_norm.is_empty() && matches_normalized_rule(&desc_norm, &pr.norm_pattern))
            || (!mkey_norm.is_empty() && matches_normalized_rule(&mkey_norm, &pr.norm_pattern));
        if matched {
            return Some(pr.rule);
        }
    }
    None
}

pub fn match_best_rule<'a>(
    description: &str,
    merchant_key: &str,
    rules: &'a [CategoryRule],
) -> Option<&'a CategoryRule> {
    let prepared = prepare_rules(rules);
    match_best_prepared_rule(description, merchant_key, &prepared)
}

pub fn extract_merchant_key(description: &str) -> String {
    let mut s = description.trim().to_lowercase();

    // Strip processor prefixes like "sq *", "tst*", "sp *", "py *"
    if let Some(star_pos) = s.find('*') {
        let prefix = s[..star_pos].trim();
        if (1..=4).contains(&prefix.len()) && prefix.chars().all(|c| c.is_ascii_alphabetic()) {
            s = s[star_pos..].trim_start_matches('*').to_string();
        }
    }

    // Strip common multi-word and colon prefixes before tokenizing
    for phrase in &[
        "mobile purchase",
        "debit card",
        "co id:",
        "indn:",
        "des:",
        "id:",
    ] {
        s = s.replace(phrase, " ");
    }

    // Replace runs of 4+ digits (store IDs, refs, phone numbers) with space
    let mut no_long_digits = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            if i - start >= 4 {
                no_long_digits.push(' ');
            } else {
                for &ch in &chars[start..i] {
                    no_long_digits.push(ch);
                }
            }
        } else {
            no_long_digits.push(chars[i]);
            i += 1;
        }
    }

    // Replace non-alphanumeric with space and filter noise words / short date tokens
    let noise_words = [
        "purchase", "ach", "web", "ppd", "tel", "pos", "recurring", "payment",
    ];
    let mut words: Vec<String> = no_long_digits
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty() && !noise_words.contains(w))
        .map(|w| w.to_string())
        .collect();

    // Strip trailing 2-letter state code if there are preceding words
    if words.len() > 1 {
        if let Some(last) = words.last() {
            if last.len() == 2 && last.chars().all(|c| c.is_ascii_alphabetic()) {
                words.pop();
            }
        }
    }

    let joined = words.join(" ");
    joined.chars().take(40).collect::<String>().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_and_word_boundary_match() {
        assert_eq!(normalize_for_match("THE_HOME_DEPOT #1234"), "the home depot 1234");
        assert!(matches_normalized_rule("the home depot 1234", "home depot"));
        assert!(!matches_normalized_rule("category", "cat"));
    }

    #[test]
    fn test_extract_merchant_key() {
        assert_eq!(extract_merchant_key("SQ *STARBUCKS STORE 12345 NY"), "starbucks store");
        assert_eq!(extract_merchant_key("Mobile Purchase HOME DEPOT #4102 GA"), "home depot");
    }
}

