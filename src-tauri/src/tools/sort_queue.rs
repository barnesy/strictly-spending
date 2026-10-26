use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;
use rusqlite::Result;

use crate::db::{DbState, Transaction, CategoryRule, Category};
use crate::tools::recurrence::RecurrenceInfo;

#[derive(Debug, Serialize, Deserialize)]
pub struct SortCard {
    #[serde(rename = "merchantKey")]
    pub merchant_key: String,
    pub txns: Vec<Transaction>,
    #[serde(rename = "totalAbs")]
    pub total_abs: f64,
    #[serde(rename = "sampleTxns")]
    pub sample_txns: Vec<Transaction>,
    pub recurrence: Option<RecurrenceInfo>,
    #[serde(rename = "suggestedCategory")]
    pub suggested_category: Option<String>,
    #[serde(rename = "amountSign")]
    pub amount_sign: String,
}

fn infer_type_category(amount: f64, source: &str, raw_category: Option<&str>) -> Option<String> {
    if (source == "chase" || source == "boa-credit") && amount > 0.0 
        && (raw_category.is_none() || raw_category.unwrap().is_empty()) {
        return Some("Transfers".to_string());
    }
    None
}

const KNOWN_BRANDS: &[&str] = &[
    "the home depot", "home depot", "the ups store", "ups store",
    "racetrac", "chevron", "quiktrip", "circle k", "citgo", "shell",
    "dunkin", "xero", "amc", "starbucks", "walmart", "target",
    "publix", "kroger", "trader joe", "whole foods", "mcdonald",
    "chick fil a", "waffle house", "marathon", "valero", "exxon",
    "speedway", "costco", "sams club", "apple", "google", "amazon",
    "netflix", "spotify", "hulu", "disney", "uber", "lyft",
    "cvs", "walgreens", "zelle", "venmo", "paypal", "robinhood",
    "coinbase", "fidelity", "vanguard", "schwab", "wealthfront", "betterment",
    "ally", "sofi", "marcus", "truist", "chase", "amex", "citi", "discover",
    "capital one", "wells fargo", "gusto", "adp", "workday", "paychex", "rippling",
];

const NOISE_WORDS: &[&str] = &[
    "trn", "id", "des", "indn", "co", "ref", "conf", "confirmation",
    "date", "time", "et", "est", "edt", "pmt", "ach", "pos", "ppd",
    "web", "tel", "seq", "orig", "bnf", "srf", "mobile", "purchase",
    "debit", "card", "withdrwl", "withdrawal", "recurring", "online",
    "banking", "from", "to", "chk", "sav", "acct", "account", "type",
    "al", "ak", "az", "ar", "ca", "ct", "de", "fl", "ga", "hi", "il",
    "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
    "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh",
    "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va",
    "wa", "wv", "wi", "wy",
];

pub fn normalize_sort_merchant_key(raw_key: &str, description: &str) -> String {
    let source = if !raw_key.trim().is_empty() { raw_key } else { description };
    let lower = source.to_lowercase();
    let cleaned: String = lower
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect();

    for brand in KNOWN_BRANDS {
        let padded = format!(" {} ", cleaned);
        let target = format!(" {} ", brand);
        if padded.contains(&target) {
            return (*brand).to_string();
        }
    }

    let words: Vec<&str> = cleaned
        .split_whitespace()
        .filter(|w| {
            if w.len() < 2 {
                return false;
            }
            // Drop masked tokens like xxxxx or tokens containing digits
            if w.chars().all(|c| c == 'x') || w.starts_with("xx") {
                return false;
            }
            if w.chars().any(|c| c.is_ascii_digit()) {
                return false;
            }
            !NOISE_WORDS.contains(w)
        })
        .collect();

    if !words.is_empty() {
        return words.into_iter().take(3).collect::<Vec<_>>().join(" ");
    }

    let fallback = raw_key.replace('_', " ").trim().to_lowercase();
    if !fallback.is_empty() {
        fallback
    } else {
        description.trim().to_lowercase()
    }
}

fn heuristic_category(text: &str, net_sum: f64, valid_category_names: &HashSet<String>) -> Option<String> {
    let padded = format!(" {} ", text.to_lowercase());
    let has_any = |keywords: &[&str]| -> bool {
        keywords.iter().any(|kw| {
            if kw.contains(' ') {
                padded.contains(kw)
            } else {
                padded.contains(&format!(" {} ", kw)) || padded.contains(kw)
            }
        })
    };

    if valid_category_names.contains("Transfers") && has_any(&[
        "wire", "xfer", "transfer", "zelle", "venmo", "cash app", "robinhood",
        "coinbase", "fidelity", "vanguard", "schwab", "wealthfront", "betterment",
        "autopay", "credit card pmt", "crcardpmt", "epayment", "mobile pymt",
        "online pmt", "bill pay", "payment thank you", "online transfer", "check",
    ]) {
        return Some("Transfers".to_string());
    }

    if net_sum > 0.0 && valid_category_names.contains("Income") && has_any(&[
        "payroll", "direct dep", "salary", "dividend", "interest", "tax refund",
        "irs treas", "paycheck", "deposit", "gusto", "adp", "workday", "paychex",
        "rippling", "paylocity", "justworks",
    ]) {
        return Some("Income".to_string());
    }

    let rules: &[(&str, &[&str])] = &[
        ("Groceries", &[
            "publix", "kroger", "whole foods", "trader joe", "aldi", "costco",
            "sams club", "safeway", "wegmans", "sprouts", "instacart", "food lion",
            "piggly wiggly", "supermarket", "grocery", "market",
        ]),
        ("Restaurants & Coffee", &[
            "starbucks", "dunkin", "mcdonald", "chick fil a", "chipotle", "panera",
            "wendys", "taco bell", "burger king", "subway", "dominos", "pizza",
            "cafe", "coffee", "bakery", "grill", "kitchen", "bistro", "tavern",
            "restaurant", "doordash", "ubereats", "grubhub", "waffle house",
            "sweetgreen", "cava", "shake shack", "popeyes", "zaxby", "bojangles",
        ]),
        ("Transportation", &[
            "chevron", "shell", "exxon", "mobil", "racetrac", "quiktrip", "wawa",
            "sheetz", "speedway", "marathon", "valero", "citgo", "circle k",
            "sunoco", "uber", "lyft", "parking", "parkmobile", "peach pass",
            "sunpass", "ezpass", "toll", "marta", "delta", "united", "southwest",
            "autozone", "jiffy lube", "discount tire",
        ]),
        ("Utilities", &[
            "georgia power", "duke energy", "fpl", "comcast", "xfinity", "att",
            "verizon", "t mobile", "tmobile", "spectrum", "cox", "google fiber",
            "electric", "gas south", "scana", "sanitation", "utility", "water",
        ]),
        ("Subscriptions", &[
            "netflix", "spotify", "hulu", "disney", "icloud", "youtube", "openai",
            "chatgpt", "claude", "anthropic", "github", "cursor", "adobe",
            "microsoft", "dropbox", "nytimes", "patreon", "substack", "xero",
            "quickbooks", "audible", "kindle",
        ]),
        ("Shopping", &[
            "amazon", "amzn", "target", "walmart", "home depot", "lowes", "ikea",
            "best buy", "etsy", "ebay", "wayfair", "tj maxx", "marshalls", "ross",
            "nordstrom", "macys", "kohls", "old navy", "nike", "lululemon",
            "chewy", "petco", "petsmart", "ups store", "fedex", "usps",
        ]),
        ("Health", &[
            "cvs", "walgreens", "rite aid", "pharmacy", "medical", "dental",
            "dentist", "doctor", "clinic", "hospital", "urgent care", "quest diag",
            "labcorp", "optometry", "vision", "therapy", "fitness", "peloton", "ymca",
        ]),
        ("Entertainment", &[
            "amc", "regal", "cinemark", "cinema", "movie", "ticketmaster", "stubhub",
            "seatgeek", "steam", "playstation", "xbox", "nintendo", "golf", "bowling",
            "museum", "zoo", "aquarium",
        ]),
        ("Insurance", &[
            "geico", "state farm", "progressive", "allstate", "usaa",
            "liberty mutual", "farmers", "insurance",
        ]),
        ("Housing", &[
            "mortgage", "rent", "hoa", "property mgmt", "apartments",
        ]),
        ("Taxes", &[
            "internal revenue", "dept of rev", "property tax", "county tax",
        ]),
        ("Fees & Interest", &[
            "overdraft", "late charge", "interest charge", "service charge",
            "wire fee", "atm fee", "annual fee", "maintenance fee",
        ]),
    ];

    for (cat, keywords) in rules {
        if valid_category_names.contains(*cat) && has_any(keywords) {
            return Some((*cat).to_string());
        }
    }

    None
}

fn suggest_category(
    txns: &[Transaction],
    merchant_key: &str,
    recurrence: Option<&RecurrenceInfo>,
    parsed_rules: &[(CategoryRule, Vec<String>)],
    valid_category_names: &HashSet<String>,
    historical_categories: &HashMap<String, String>,
) -> Option<String> {
    if txns.is_empty() {
        return None;
    }
    let first = &txns[0];

    // 1. infer_type_category
    if let Some(inferred) = infer_type_category(first.amount, &first.source, first.raw_category.as_deref()) {
        if valid_category_names.contains(&inferred) {
            return Some(inferred);
        }
    }

    // 2. Fuzzy keyword match against user rules
    let combined_text = format!("{} {}", merchant_key, first.description).to_lowercase();
    let key_tokens: HashSet<&str> = combined_text
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 3)
        .collect();

    if !key_tokens.is_empty() {
        let mut best: Option<&CategoryRule> = None;
        for (rule, tokens) in parsed_rules {
            if tokens.is_empty() {
                continue;
            }
            let all_match = tokens.iter().all(|pt| key_tokens.contains(pt.as_str()));
            if all_match {
                if let Some(b) = best {
                    if rule.priority > b.priority {
                        best = Some(rule);
                    }
                } else {
                    best = Some(rule);
                }
            }
        }
        if let Some(b) = best {
            return Some(b.category.clone());
        }
    }

    // 3. Historical categorized transactions with same merchant stem
    if let Some(hist_cat) = historical_categories.get(merchant_key) {
        if valid_category_names.contains(hist_cat) {
            return Some(hist_cat.clone());
        }
    }
    for t in txns {
        if let Some(hist_cat) = historical_categories.get(&t.merchant_key) {
            if valid_category_names.contains(hist_cat) {
                return Some(hist_cat.clone());
            }
        }
    }

    // 4. Built-in high-confidence keyword heuristics
    let net_sum: f64 = txns.iter().map(|t| t.amount).sum();
    if let Some(heur) = heuristic_category(&combined_text, net_sum, valid_category_names) {
        return Some(heur);
    }

    // 5. Recurring-amount lean
    if let Some(rec) = recurrence {
        if (rec.kind == "monthly" || rec.kind == "weekly" || rec.kind == "biweekly" || rec.kind == "annual") && rec.mean_amount > 0.0 {
            let amt = rec.mean_amount;
            if rec.kind == "monthly" {
                if amt >= 1000.0 && valid_category_names.contains("Housing") {
                    return Some("Housing".to_string());
                }
                if (5.0..=50.0).contains(&amt) && valid_category_names.contains("Subscriptions") {
                    return Some("Subscriptions".to_string());
                }
            }
        }
    }

    None
}

#[tauri::command]
pub fn get_sort_queue(state: State<DbState>, demo_mode: bool) -> Result<Vec<SortCard>, String> {
    let conn = state.conn.lock().unwrap();

    let mut uncategorized: Vec<Transaction> = Vec::new();
    let mut valid_category_names = HashSet::new();
    let mut parsed_rules = Vec::new();
    let mut historical_categories: HashMap<String, String> = HashMap::new();

    {
        // Fetch Uncategorized transactions
        let mut stmt = conn.prepare("SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, is_pending FROM transactions WHERE category = 'Uncategorized'").map_err(|e| e.to_string())?;
        
        let tx_iter = stmt.query_map([], crate::db::row_to_transaction).map_err(|e| e.to_string())?;

        for t in tx_iter.flatten() {
            let is_demo = t.source == "demo";
            if demo_mode == is_demo {
                uncategorized.push(t);
            }
        }

        // Fetch Historical Categorized Merchant Stems
        let mut hist_stmt = conn.prepare(
            "SELECT merchant_key, description, category, COUNT(*) as cnt
             FROM transactions
             WHERE category != 'Uncategorized'
               AND ((?1 = 1 AND source = 'demo') OR (?1 = 0 AND source != 'demo'))
             GROUP BY merchant_key, category
             ORDER BY cnt DESC"
        ).map_err(|e| e.to_string())?;
        let demo_flag = if demo_mode { 1 } else { 0 };
        let hist_iter = hist_stmt.query_map([demo_flag], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }).map_err(|e| e.to_string())?;
        for item in hist_iter.flatten() {
            let (raw_mk, desc, cat) = item;
            if !raw_mk.is_empty() {
                historical_categories.entry(raw_mk.clone()).or_insert_with(|| cat.clone());
            }
            let stem = normalize_sort_merchant_key(&raw_mk, &desc);
            if !stem.is_empty() {
                historical_categories.entry(stem).or_insert(cat);
            }
        }

        // Fetch Categories
        let mut cat_stmt = conn.prepare("SELECT id, name, color, type, sort_order, default_recurrence FROM categories").map_err(|e| e.to_string())?;
        let cat_iter = cat_stmt.query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                category_type: row.get(3)?,
                sort_order: row.get(4)?,
                default_recurrence: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        for c in cat_iter.flatten() {
            valid_category_names.insert(c.name);
        }

        // Fetch Rules
        let mut rules_stmt = conn.prepare("SELECT id, pattern, category, priority, created_at FROM rules").map_err(|e| e.to_string())?;
        let rules_iter = rules_stmt.query_map([], |row| {
            Ok(CategoryRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                category: row.get(2)?,
                priority: row.get(3)?,
                created_at: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        
        for r in rules_iter.flatten() {
            if valid_category_names.contains(&r.category) {
                let lower_pat = r.pattern.to_lowercase();
                let tokens: Vec<String> = lower_pat
                    .split(|c: char| !c.is_ascii_alphanumeric())
                    .filter(|t| t.len() >= 3)
                    .map(|s| s.to_string())
                    .collect();
                if !tokens.is_empty() {
                    parsed_rules.push((r, tokens));
                }
            }
        }
    }

    // Drop lock before calling build_recurrence_map, which also needs a lock.
    drop(conn);

    let recurrence_map = crate::tools::recurrence::build_recurrence_map(state.clone(), demo_mode, None)
        .map_err(|e| e.to_string())?;

    // Group by normalized merchant stem so bank variations collapse into a single card
    let mut by_key: HashMap<String, Vec<Transaction>> = HashMap::new();
    for t in uncategorized {
        let k = normalize_sort_merchant_key(&t.merchant_key, &t.description);
        by_key.entry(k).or_default().push(t);
    }

    let mut cards: Vec<SortCard> = Vec::new();

    for (merchant_key, mut txns) in by_key {
        if txns.is_empty() {
            continue;
        }

        // Newest-first samples
        txns.sort_by(|a, b| b.date.cmp(&a.date));
        let sample_txns = txns.iter().take(10).cloned().collect();

        let total_abs: f64 = txns.iter().map(|t| t.amount.abs()).sum();
        let net_sum: f64 = txns.iter().map(|t| t.amount).sum();
        let amount_sign = if net_sum >= 0.0 { "income".to_string() } else { "spend".to_string() };

        let rec = recurrence_map
            .get(&merchant_key)
            .or_else(|| txns.iter().find_map(|t| recurrence_map.get(&t.merchant_key)));
        let suggestion = suggest_category(
            &txns,
            &merchant_key,
            rec,
            &parsed_rules,
            &valid_category_names,
            &historical_categories,
        );

        cards.push(SortCard {
            merchant_key,
            txns,
            total_abs,
            sample_txns,
            recurrence: rec.cloned(),
            suggested_category: suggestion,
            amount_sign,
        });
    }

    cards.sort_by(|a, b| b.total_abs.partial_cmp(&a.total_abs).unwrap_or(std::cmp::Ordering::Equal));

    Ok(cards)
}
