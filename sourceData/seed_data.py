import os
import sqlite3
import re

db_path = r"C:\Users\swaroop.raj\Documents\workspace\antigravity\advisoryAgentMVP\sourceData\advisor_portal.db"
excel_path = r"C:\Users\swaroop.raj\Documents\workspace\antigravity\advisoryAgentMVP\sourceData\iShares-UnitedStates.xls"
templates_dir = r"C:\Users\swaroop.raj\Documents\workspace\antigravity\advisoryAgentMVP\templates"

def seed_db():
    print("Deleting old SQLite Database if exists...")
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print("Old database deleted successfully.")
        except Exception as e:
            print("Error deleting old database, trying table drops instead:", e)
            
    print("Initializing fresh SQLite Database with Advisor Table for MVP...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Drop existing tables if database couldn't be deleted
    for table in ['meeting_note', 'template', 'asset_allocation_target', 'life_event', 'task', 'holding', 'account', 'contact', 'advisor', 'etf']:
        cursor.execute(f"DROP TABLE IF EXISTS {table}")
    conn.commit()

    # Create Tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS advisor (
        advisor_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        role TEXT,
        employee_id TEXT,
        department TEXT,
        portfolio_allocated TEXT,
        aum_managed REAL,
        employee_manager TEXT
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS contact (
        contact_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        birthdate TEXT,
        marital_status TEXT,
        employment_status TEXT
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS account (
        account_id TEXT PRIMARY KEY,
        household_name TEXT,
        total_aum REAL,
        investment_objective TEXT,
        risk_tolerance TEXT,
        service_tier TEXT,
        next_review_date TEXT,
        advisor_id TEXT,
        FOREIGN KEY(advisor_id) REFERENCES advisor(advisor_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS holding (
        holding_id TEXT PRIMARY KEY,
        account_id TEXT,
        ticker TEXT,
        fund_name TEXT,
        shares INTEGER,
        market_value REAL,
        cost_basis REAL,
        expense_ratio REAL,
        FOREIGN KEY(account_id) REFERENCES account(account_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS task (
        task_id TEXT PRIMARY KEY,
        account_id TEXT,
        subject TEXT,
        activity_date TEXT,
        status TEXT,
        description TEXT,
        priority TEXT,
        task_type TEXT,
        flag_status TEXT,
        FOREIGN KEY(account_id) REFERENCES account(account_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS life_event (
        event_id TEXT PRIMARY KEY,
        account_id TEXT,
        event_name TEXT,
        event_type TEXT,
        event_date TEXT,
        description TEXT,
        FOREIGN KEY(account_id) REFERENCES account(account_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS etf (
        ticker TEXT PRIMARY KEY,
        name TEXT,
        asset_class TEXT,
        sub_asset_class TEXT,
        net_expense_ratio REAL,
        net_assets REAL,
        yield_12m REAL,
        duration REAL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS asset_allocation_target (
        allocation_id TEXT PRIMARY KEY,
        account_id TEXT,
        asset_class TEXT,
        target_pct REAL,
        actual_pct REAL,
        drift_pct REAL,
        flag_status TEXT,
        FOREIGN KEY(account_id) REFERENCES account(account_id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS template (
        template_id TEXT PRIMARY KEY,
        template_name TEXT NOT NULL,
        template_type TEXT NOT NULL,
        purpose TEXT,
        body TEXT NOT NULL,
        placeholders TEXT,
        file_name TEXT NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS meeting_note (
        note_id TEXT PRIMARY KEY,
        account_id TEXT,
        advisor_id TEXT,
        meeting_date TEXT,
        meeting_type TEXT,
        subject TEXT,
        attendees TEXT,
        summary TEXT,
        action_items TEXT,
        next_meeting_date TEXT,
        sentiment TEXT,
        FOREIGN KEY(account_id) REFERENCES account(account_id),
        FOREIGN KEY(advisor_id) REFERENCES advisor(advisor_id)
    )
    ''')
    
    # Seed Advisor (Primary Persona Sarah Mitchell, CFP)
    cursor.execute("INSERT INTO advisor VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   ("ADV_001", "Sarah", "Mitchell", "Senior Wealth Advisor & Practice Lead", "EMP_9021", "Private Wealth Management", "Book of Business A", 180000000.00, "David Harrison, Head of Private Wealth"))
    
    # Seed Contact
    cursor.execute("INSERT INTO contact VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ("CON_001", "Robert", "Chen", "robert.chen@email.com", "(415) 555-0182", "1968-03-14", "Married", "Employed"))
    cursor.execute("INSERT INTO contact VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ("CON_002", "Patricia", "Chen", "patricia.chen@email.com", "(415) 555-0183", "1970-07-22", "Married", "Employed"))
    
    # Seed Account (Chen Household) associated with advisor ADV_001
    cursor.execute("INSERT INTO account VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ("ACC_001", "Chen Household", 1800000.00, "Growth & Income", "Moderate", "Tier 1 — Wealth", "2026-09-15", "ADV_001"))
    
    # Seed Holdings (Allocating across 8 specific ETFs + CASH, showing Cash Drag and Style Drifts)
    holdings = [
        # US Equity (Target: 45%, Actual: 20%) - Red Flag: Underweight
        ("HLD_001", "ACC_001", "IVV", "iShares Core S&P 500 ETF", 650, 360000.00, 290000.00, 0.03),
        
        # International Equity (Target: 20%, Actual: 20%) - Green Flag
        ("HLD_002", "ACC_001", "IEFA", "iShares Core MSCI EAFE ETF", 1250, 90000.00, 85000.00, 0.07),
        ("HLD_003", "ACC_001", "IEMG", "iShares Core MSCI Emerging Markets ETF", 1800, 90000.00, 98000.00, 0.09), # Tax Loss Candidate
        
        # US Mid/Small Cap (Part of Equities)
        ("HLD_004", "ACC_001", "IJH", "iShares Core S&P Mid-Cap ETF", 130, 45000.00, 41000.00, 0.05),
        ("HLD_005", "ACC_001", "IJR", "iShares Core S&P Small-Cap ETF", 400, 45000.00, 42000.00, 0.06),
        
        # Fixed Income (Target: 30%, Actual: 10%) - Red Flag: Underweight
        ("HLD_006", "ACC_001", "AGG", "iShares Core U.S. Aggregate Bond ETF", 1020, 100000.00, 108000.00, 0.03),
        ("HLD_007", "ACC_001", "IEF", "iShares 7-10 Year Treasury Bond ETF", 475, 45000.00, 47000.00, 0.15),
        ("HLD_008", "ACC_001", "SGOV", "iShares 0-3 Month Treasury Bond ETF", 350, 35000.00, 35000.00, 0.09),
        
        # High-Cost Active Fund (Yellow Flag: Fee Drag Optimization)
        ("HLD_009", "ACC_001", "ACT_BND", "Active Yield Opportunity Bond Mutual Fund", 1, 90000.00, 90000.00, 0.85), # High 0.85% expense ratio
        
        # Cash & Cash Alts (Target: 5%, Actual: 50%) - Red Flag: Cash Drag
        ("HLD_010", "ACC_001", "CASH", "Cash & Money Market", 1, 900000.00, 900000.00, 0.0)
    ]
    cursor.executemany("INSERT INTO holding VALUES (?, ?, ?, ?, ?, ?, ?, ?)", holdings)
    
    # Recalculate AUM from Holdings to keep it aligned
    cursor.execute("SELECT SUM(market_value) FROM holding WHERE account_id = 'ACC_001'")
    total_aum = cursor.fetchone()[0]
    cursor.execute("UPDATE account SET total_aum = ? WHERE account_id = 'ACC_001'", (total_aum,))
    print(f"Calculated Total AUM from Holdings: ${total_aum:,.2f}")
    
    # Seed Asset Allocation Targets
    targets = [
        ("ALC_001", "ACC_001", "Equity", 65.0, 35.0, -30.0, "RED_FLAG"),
        ("ALC_002", "ACC_001", "Fixed Income", 30.0, 15.0, -15.0, "RED_FLAG"),
        ("ALC_003", "ACC_001", "Cash", 5.0, 50.0, 45.0, "RED_FLAG")
    ]
    cursor.executemany("INSERT INTO asset_allocation_target VALUES (?, ?, ?, ?, ?, ?, ?)", targets)
    
    # Seed Tasks with specific Red and Yellow Flag Indicators
    tasks = [
        # Yellow Flag: Compliance KYC Renewal Overdue
        ("TSK_001", "ACC_001", "Overdue KYC Document Review", "2026-06-15", "Overdue", "KYC Profile update has exceeded renewal period by 45 days. Advisor action required.", "High", "Compliance", "YELLOW_FLAG"),
        
        # Yellow Flag: IPS Statement Review Impending
        ("TSK_002", "ACC_001", "Annual Investment Policy Statement (IPS) Signature", "2026-08-30", "In Progress", "Send updated IPS model containing Roth Conversion scenario draft to Robert for signature.", "High", "Administrative", "YELLOW_FLAG"),
        
        # Historical tasks for reference
        ("TSK_003", "ACC_001", "Model Roth scenario options", "2026-03-22", "Completed", "Modeled $50k, $75k, and $100k Roth conversion ladders. Robert approved $75k subject to rebalancing.", "Medium", "Planning", "GREEN_FLAG")
    ]
    cursor.executemany("INSERT INTO task VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", tasks)
    
    # Seed Life Events
    life_events = [
        ("EVT_001", "ACC_001", "Daughter College Enrollment", "Education", "2027-08-15", "Emily Chen starting at UC Berkeley — 529 drawdown begins"),
        ("EVT_002", "ACC_001", "Planned Retirement", "Retirement", "2033-03-14", "Target retirement at age 65 — both Robert & Patricia")
    ]
    cursor.executemany("INSERT INTO life_event VALUES (?, ?, ?, ?, ?, ?)", life_events)

    # Seed Meeting Notes (CRM-style interaction history)
    meeting_notes = [
        (
            "MTG_001", "ACC_001", "ADV_001",
            "2026-06-18", "Phone",
            "Portfolio Review & College Planning Check-in",
            "Sarah Mitchell, Robert Chen",
            "Reviewed current portfolio allocation. Robert noted the large cash position and asked if we should start rebalancing ahead of Emily's college enrollment (Aug 2027). Discussed 529 balance and estimated first-year tuition costs (~$45K). Robert wants a drawdown plan ready before year-end. Also reviewed the KYC renewal — Robert will send updated documents by end of month.",
            "1. Prepare 529 drawdown schedule for Emily's UC Berkeley tuition. 2. Draft a simple rebalancing proposal to reduce cash overweight. 3. Robert to submit KYC documents by June 30.",
            "2026-07-24",
            "Positive"
        ),
        (
            "MTG_002", "ACC_001", "ADV_001",
            "2026-07-24", "Video",
            "Rebalancing Proposal Review & 529 Drawdown Plan",
            "Sarah Mitchell, Robert Chen, Patricia Chen",
            "Presented rebalancing proposal: deploy $300K from cash into equity and fixed income over next quarter to bring allocation closer to IPS targets. Robert and Patricia agreed to proceed gradually. Reviewed 529 drawdown plan — first distribution of $22K for tuition due July 2027, with $15K housing deposit due Dec 2026. Patricia confirmed Emily's enrollment is on track. Robert signed updated IPS. KYC documents received and filed.",
            "1. Begin Phase 1 rebalance — move $150K from cash to IVV and AGG in September. 2. Set reminder for $15K 529 housing deposit distribution in November. 3. Review active bond fund (ACT_BND) fees vs passive alternatives at next meeting. 4. Send Robert Roth conversion summary for 2027 planning.",
            "2026-08-28",
            "Positive"
        )
    ]
    cursor.executemany("INSERT INTO meeting_note VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", meeting_notes)

    # Parse iShares ETF sheet and seed ETF table
    if os.path.exists(excel_path):
        print("Parsing iShares Excel file...")
        try:
            with open(excel_path, 'r', encoding='utf-8-sig') as f:
                content = f.read()
            rows_xml = re.findall(r'<Row.*?>(.*?)</Row>', content, re.DOTALL)
            
            etfs_inserted = 0
            for r_xml in rows_xml[2:]:
                data_matches = re.findall(r'<Data[^>]*>(.*?)</Data>', r_xml, re.DOTALL)
                data_clean = [re.sub(r'<[^>]+>', '', d).strip() for d in data_matches]
                
                if len(data_clean) >= 11:
                    ticker = data_clean[0]
                    name = data_clean[1]
                    asset_class = data_clean[10]
                    sub_asset_class = data_clean[11] if len(data_clean) > 11 else ""
                    
                    try:
                        net_exp = float(data_clean[7]) if len(data_clean) > 7 and data_clean[7] != '-' else 0.0
                    except:
                        net_exp = 0.0
                        
                    try:
                        net_assets = float(data_clean[8]) if len(data_clean) > 8 and data_clean[8] != '-' else 0.0
                    except:
                        net_assets = 0.0
                        
                    try:
                        yield_val = float(data_clean[203]) if len(data_clean) > 203 and data_clean[203] != '-' else 0.0
                    except:
                        yield_val = 0.0
                        
                    try:
                        duration = float(data_clean[218]) if len(data_clean) > 218 and data_clean[218] != '-' else 0.0
                    except:
                        duration = 0.0
                        
                    cursor.execute("INSERT OR REPLACE INTO etf VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                   (ticker, name, asset_class, sub_asset_class, net_exp, net_assets, yield_val, duration))
                    etfs_inserted += 1
            print(f"Successfully inserted {etfs_inserted} ETFs from Excel.")
        except Exception as e:
            print("Error parsing iShares Excel:", e)
    else:
        print(f"iShares Excel not found at {excel_path}. Seeding core ETFs manually...")
        manual_etfs = [
            ("IVV", "iShares Core S&P 500 ETF", "Equity", "Large Cap", 0.03, 9.04e11, 1.30, 0.0),
            ("IJH", "iShares Core S&P Mid-Cap ETF", "Equity", "Mid Cap", 0.05, 1.27e11, 1.45, 0.0),
            ("IJR", "iShares Core S&P Small-Cap ETF", "Equity", "Small Cap", 0.06, 1.12e11, 1.35, 0.0),
            ("IEFA", "iShares Core MSCI EAFE ETF", "Equity", "All Cap", 0.07, 1.95e11, 2.75, 0.0),
            ("IEMG", "iShares Core MSCI Emerging Markets ETF", "Equity", "All Cap", 0.09, 1.55e11, 2.90, 0.0),
            ("AGG", "iShares Core U.S. Aggregate Bond ETF", "Fixed Income", "Multi Sectors", 0.03, 1.37e11, 4.05, 6.2),
            ("IEF", "iShares 7-10 Year Treasury Bond ETF", "Fixed Income", "Government", 0.15, 4.71e10, 3.85, 7.5),
            ("SGOV", "iShares 0-3 Month Treasury Bond ETF", "Fixed Income", "Government", 0.09, 1.01e11, 5.15, 0.1)
        ]
        cursor.executemany("INSERT INTO etf VALUES (?, ?, ?, ?, ?, ?, ?, ?)", manual_etfs)
        
    # Seed Templates from /templates folder
    print("Loading templates...")
    template_files = {
        "suitability_memo_template.txt": "memo",
        "trade_rationale_memo_template.txt": "memo",
        "compliance_document_template.txt": "document",
    }
    templates_loaded = 0
    for file_name, template_type in template_files.items():
        file_path = os.path.join(templates_dir, file_name)
        if not os.path.exists(file_path):
            print(f"  Warning: Template file not found: {file_name}")
            continue
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        template_id = ""
        template_name = ""
        purpose = ""
        for line in content.splitlines():
            if line.startswith("MEMO ID:"):
                template_id = line.split(":", 1)[1].strip()
            elif line.startswith("DOCUMENT ID:"):
                template_id = line.split(":", 1)[1].strip()
            elif line.startswith("MEMO NAME:"):
                template_name = line.split(":", 1)[1].strip()
            elif line.startswith("DOCUMENT NAME:"):
                template_name = line.split(":", 1)[1].strip()
            elif line.startswith("PURPOSE:"):
                purpose = line.split(":", 1)[1].strip()

        placeholders = ",".join(re.findall(r'\{(\w+)\}', content))

        cursor.execute("INSERT OR REPLACE INTO template VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (template_id, template_name, template_type, purpose, content, placeholders, file_name))
        templates_loaded += 1
    print(f"Successfully loaded {templates_loaded} templates.")

    conn.commit()
    conn.close()
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_db()
