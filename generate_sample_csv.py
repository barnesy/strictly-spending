import csv
import random
from datetime import date, timedelta

# Configuration
start_date = date(2023, 7, 1)
end_date = date(2026, 7, 13)
csv_path = '/Users/barnesy/Projects/spending-viz/sample_transactions.csv'

transactions = []

def add_transaction(d, account, desc, category, amount):
    """Helper to add a transaction with rounded amounts."""
    transactions.append({
        "Date": d.strftime("%Y-%m-%d"),
        "Account": account,
        "Description": desc,
        "Category": category,
        "Amount": round(amount, 2)
    })

current_date = start_date

# Initial Paydays
alice_payday = date(2023, 7, 7)
bob_payday = date(2023, 7, 14)

while current_date <= end_date:
    # ---------------------------------------------------------
    # INCOME
    # ---------------------------------------------------------
    # Alice: ~$180k/yr -> $15k/mo gross. Bi-weekly is ~26 paychecks. Net ~4800.
    if (current_date - alice_payday).days % 14 == 0:
        add_transaction(current_date, "Alice Checking", "GUSTO PAYROLL", "Income", 4846.15)
    
    # Bob: ~$120k/yr -> $10k/mo gross. Bi-weekly is ~26 paychecks. Net ~3300.
    if (current_date - bob_payday).days % 14 == 0:
        add_transaction(current_date, "Bob Checking", "ADP PAYROLL", "Income", 3323.08)
    
    # Annual Bonuses (Paid mid-March)
    if current_date.month == 3 and current_date.day == 15:
        add_transaction(current_date, "Alice Checking", "GUSTO BONUS", "Income", round(random.uniform(9000, 14000), 2))
        add_transaction(current_date, "Bob Checking", "ADP BONUS", "Income", round(random.uniform(4000, 8000), 2))

    # Tax Return (April)
    if current_date.month == 4 and current_date.day == 18:
        add_transaction(current_date, "Joint Checking", "IRS TREAS 310 TAX REF", "Income", round(random.uniform(1500, 4000), 2))

    # ---------------------------------------------------------
    # TRANSFERS TO JOINT (For shared expenses like Mortgage/Utilities)
    # ---------------------------------------------------------
    if current_date.day == 1:
        add_transaction(current_date, "Alice Checking", "Transfer to Joint", "Transfer", -6000.00)
        add_transaction(current_date, "Joint Checking", "Transfer from Alice", "Transfer", 6000.00)
        
        add_transaction(current_date, "Bob Checking", "Transfer to Joint", "Transfer", -4000.00)
        add_transaction(current_date, "Joint Checking", "Transfer from Bob", "Transfer", 4000.00)
        
    # ---------------------------------------------------------
    # FIXED EXPENSES
    # ---------------------------------------------------------
    # Mortgage (Joint)
    if current_date.day == 1:
        add_transaction(current_date, "Joint Checking", "CHASE MORTGAGE", "Housing", -4500.00)
        
    # Auto Loan (Alice)
    if current_date.day == 5:
        add_transaction(current_date, "Alice Checking", "TESLA FINANCIAL", "Auto Loan", -650.00)
        
    # Student Loans (Individual)
    if current_date.day == 12:
        add_transaction(current_date, "Alice Checking", "NELNET STUDENT LOAN", "Student Loan", -400.00)
        add_transaction(current_date, "Bob Checking", "MOHELA STUDENT LOAN", "Student Loan", -600.00)
        
    # Insurances & Gyms
    if current_date.day == 2:
        add_transaction(current_date, "Alice Checking", "EQUINOX FITNESS", "Health/Gym", -150.00)
        add_transaction(current_date, "Bob Checking", "PLANET FITNESS", "Health/Gym", -50.00)
        
    if current_date.day == 15:
        add_transaction(current_date, "Joint Checking", "COMCAST INTERNET", "Utilities", -110.00)
        
    if current_date.day == 20:
        add_transaction(current_date, "Joint Checking", "STATE FARM HOME INS", "Insurance", -120.00)
        add_transaction(current_date, "Alice Checking", "GEICO AUTO INS", "Insurance", -150.00)

    # ---------------------------------------------------------
    # UTILITIES (VARIABLE)
    # ---------------------------------------------------------
    if current_date.day == 18:
        # Electricity - higher in summer
        base = 180 if current_date.month in [6, 7, 8, 9] else 90
        add_transaction(current_date, "Joint Checking", "CITY POWER AND LIGHT", "Utilities", -(base + random.uniform(-20, 30)))
        
    if current_date.day == 22:
        # Gas - higher in winter
        base = 120 if current_date.month in [11, 12, 1, 2, 3] else 35
        add_transaction(current_date, "Joint Checking", "NATIONAL GRID GAS", "Utilities", -(base + random.uniform(-10, 20)))
        
    if current_date.day == 25:
        add_transaction(current_date, "Joint Checking", "CITY WATER DEPT", "Utilities", -(70 + random.uniform(-10, 15)))

    # ---------------------------------------------------------
    # SUBSCRIPTIONS
    # ---------------------------------------------------------
    if current_date.day == 3: add_transaction(current_date, "Joint Checking", "NETFLIX", "Subscriptions", -15.49)
    if current_date.day == 10: add_transaction(current_date, "Bob Checking", "SPOTIFY", "Subscriptions", -10.99)
    if current_date.day == 19: add_transaction(current_date, "Alice Checking", "AMAZON PRIME", "Subscriptions", -14.99)
    if current_date.day == 27: add_transaction(current_date, "Joint Checking", "NY TIMES", "Subscriptions", -25.00)

    # ---------------------------------------------------------
    # DAY-TO-DAY VARIABLE SPENDING
    # ---------------------------------------------------------
    # Joint Groceries & Household
    if current_date.weekday() in [5, 6] and random.random() < 0.8:
        store = random.choice(["WHOLE FOODS", "TRADER JOES", "WEGMANS", "KROGER"])
        add_transaction(current_date, "Joint Checking", store, "Groceries", -random.uniform(90, 280))
    if random.random() < 0.15: # Mid-week grocery top up
        add_transaction(current_date, "Joint Checking", "TARGET", "Groceries", -random.uniform(30, 80))
        
    # Joint Dining Out
    if current_date.weekday() in [4, 5] and random.random() < 0.6:
        restaurants = ["LOCAL BISTRO", "SUSHI YAMA", "ITALIAN OVEN", "STEAKHOUSE", "THAI SPICE", "BREWERY"]
        add_transaction(current_date, "Joint Checking", random.choice(restaurants), "Dining Out", -random.uniform(60, 220))

    # Home Improvement & Pets
    if random.random() < 0.05:
        add_transaction(current_date, "Joint Checking", "HOME DEPOT", "Home", -random.uniform(40, 300))
    if current_date.day == 14:
        add_transaction(current_date, "Joint Checking", "CHEWY.COM", "Pets", -random.uniform(60, 100))

    # Alice Personal Variable
    if random.random() < 0.25:
        add_transaction(current_date, "Alice Checking", random.choice(["SWEETGREEN", "CAVA", "STARBUCKS"]), "Dining Out", -random.uniform(8, 25))
    if random.random() < 0.15:
        add_transaction(current_date, "Alice Checking", "AMAZON", "Shopping", -random.uniform(20, 120))
    if random.random() < 0.15:
        add_transaction(current_date, "Alice Checking", "SHELL GAS", "Auto", -random.uniform(30, 75))
    if random.random() < 0.08:
        add_transaction(current_date, "Alice Checking", "SEPHORA", "Personal Care", -random.uniform(40, 150))
        
    # Bob Personal Variable
    if random.random() < 0.3:
        add_transaction(current_date, "Bob Checking", random.choice(["CHIPOTLE", "PANERA", "PEETS COFFEE"]), "Dining Out", -random.uniform(10, 35))
    if random.random() < 0.15:
        add_transaction(current_date, "Bob Checking", "UBER", "Transportation", -random.uniform(15, 60))
    if random.random() < 0.05:
        add_transaction(current_date, "Bob Checking", "STEAM GAMES", "Entertainment", -random.uniform(20, 80))
    if random.random() < 0.08:
        add_transaction(current_date, "Bob Checking", "BARBERSHOP", "Personal Care", -random.uniform(35, 60))

    # Healthcare / Medical
    if random.random() < 0.03:
        add_transaction(current_date, "Joint Checking", "CVS PHARMACY", "Medical", -random.uniform(15, 65))
    if random.random() < 0.01:
        add_transaction(current_date, "Joint Checking", "CITY HOSPITAL COPAY", "Medical", -random.uniform(100, 500))

    # ---------------------------------------------------------
    # SEASONAL / SPIKY EXPENSES
    # ---------------------------------------------------------
    # Holidays
    if current_date.month == 12 and random.random() < 0.2:
        acct = random.choice(["Alice Checking", "Bob Checking", "Joint Checking"])
        add_transaction(current_date, acct, "APPLE STORE", "Shopping", -random.uniform(100, 500))
        
    if current_date.month == 11 and current_date.day > 24 and random.random() < 0.4:
        acct = random.choice(["Alice Checking", "Bob Checking"])
        add_transaction(current_date, acct, "AMAZON", "Shopping", -random.uniform(50, 400))

    # Travel / Vacations (e.g., booked in March/August)
    if current_date.month == 3 and current_date.day == 10:
        add_transaction(current_date, "Joint Checking", "DELTA AIRLINES", "Travel", -random.uniform(800, 1600))
    if current_date.month == 3 and current_date.day == 15:
        add_transaction(current_date, "Joint Checking", "MARRIOTT HOTELS", "Travel", -random.uniform(1000, 2500))

    if current_date.month == 8 and current_date.day == 5:
        add_transaction(current_date, "Joint Checking", "AIRBNB", "Travel", -random.uniform(500, 1200))

    current_date += timedelta(days=1)

# Sort transactions by date
# Sort transactions by date
transactions.sort(key=lambda x: x["Date"])

# Group by account
accounts_data = {
    "Alice Checking": {"filename": "Chase1111_Alice.csv", "rows": []},
    "Bob Checking": {"filename": "Chase2222_Bob.csv", "rows": []},
    "Joint Checking": {"filename": "Chase3333_Joint.csv", "rows": []},
}

for t in transactions:
    accounts_data[t["Account"]]["rows"].append({
        "Transaction Date": t["Date"],
        "Post Date": t["Date"],
        "Description": t["Description"],
        "Category": t["Category"],
        "Type": "Sale",
        "Amount": t["Amount"],
        "Memo": ""
    })

for acct_name, data in accounts_data.items():
    path = f"/Users/barnesy/Projects/spending-viz/{data['filename']}"
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"])
        writer.writeheader()
        writer.writerows(data["rows"])
    print(f"Saved {len(data['rows'])} transactions to {path}")
