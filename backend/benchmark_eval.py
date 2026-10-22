import urllib.request
import json
import time
import re
import os
import sys

# Ensure UTF-8 stdout on Windows
if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

OLLAMA_URL = "http://localhost:11434/api/generate"

# --- 1. Labeled Test Dataset (30 Cases: 10 Urgent, 10 Important, 10 Normal) ---
DATASET = [
    # URGENT (10)
    {"id": 1, "expected": "URGENT", "subject": "CRITICAL: Database primary node down, failover failed", "snippet": "Production DB cluster is unreachable. Users getting 500 errors. Immediate intervention required."},
    {"id": 2, "expected": "URGENT", "subject": "URGENT: SSL Certificate Expiring at Midnight Tonight", "snippet": "Our api.company.com TLS cert expires in 6 hours. Traffic will be blocked if not renewed now."},
    {"id": 3, "expected": "URGENT", "subject": "ACTION REQUIRED: Production security vulnerability CVE-2026-8910", "snippet": "Critical severity patch must be applied to all public ingress clusters before 5 PM today."},
    {"id": 4, "expected": "URGENT", "subject": "Immediate Action: Payroll gateway failing for EU employees", "snippet": "Bank transfers rejected due to API timeout. Payroll will fail unless we approve fallback file in 1 hour."},
    {"id": 5, "expected": "URGENT", "subject": "Emergency: Ransomware alert detected on file server", "snippet": "SOC has isolated host 10.0.4.12. IT admin must confirm quarantine approval immediately."},
    {"id": 6, "expected": "URGENT", "subject": "URGENT: Client contract renewal deadline today 6pm", "snippet": "Acme Corp legal will cancel the enterprise agreement if revised SOW is not signed before COB today."},
    {"id": 7, "expected": "URGENT", "subject": "Urgent: Cloud quota exhausted, builds halted", "snippet": "AWS GPU quota reached 100%. CI/CD release pipeline blocked. Please request quota increase now."},
    {"id": 8, "expected": "URGENT", "subject": "URGENT: Office building power outage scheduled in 30 mins", "snippet": "Building maintenance emergency shutdown. Save your workstation work and shut down servers now."},
    {"id": 9, "expected": "URGENT", "subject": "Immediate reply requested: Customer escalations lead resignation", "snippet": "Lead support engineer submitted notice effective immediately. Need emergency coverage sync at 2pm."},
    {"id": 10, "expected": "URGENT", "subject": "CRITICAL ALERT: Payment processing error rate spike 45%", "snippet": "Stripe webhook dropped payments over the last 15 minutes. Dev on-call must acknowledge."},

    # IMPORTANT (10)
    {"id": 11, "expected": "IMPORTANT", "subject": "Feedback needed on Q4 Engineering Roadmap", "snippet": "Please review the attached roadmap document and add your comments by Thursday afternoon."},
    {"id": 12, "expected": "IMPORTANT", "subject": "Invoice #8921 pending review and manager sign-off", "snippet": "Attached is the Datadog monthly billing invoice for $4,200. Please verify department allocation."},
    {"id": 13, "expected": "IMPORTANT", "subject": "Reschedule: 1-on-1 Sync with Engineering Lead", "snippet": "Could we shift our 1-on-1 from Wednesday to Thursday at 11 AM due to conflict? Let me know."},
    {"id": 14, "expected": "IMPORTANT", "subject": "Candidate Interview Feedback - Senior Backend Engineer", "snippet": "Please submit your scorecard for candidate Alex Rivera before Friday's hiring committee meeting."},
    {"id": 15, "expected": "IMPORTANT", "subject": "Action item from Sprint Retrospective: Update API docs", "snippet": "As agreed in retro, please ensure the OpenAPI specification reflects the new authentication route."},
    {"id": 16, "expected": "IMPORTANT", "subject": "Draft Proposal for Client Onboarding Automation", "snippet": "Hey team, sharing initial proposal for the new workflow. Looking for feedback from lead devs."},
    {"id": 17, "expected": "IMPORTANT", "subject": "Quarterly OKR Review Preparation", "snippet": "Team leads, please update key results percentages in the tracker prior to next Monday's review."},
    {"id": 18, "expected": "IMPORTANT", "subject": "Vendor Agreement Review: MongoDB Atlas Enterprise", "snippet": "Legal has marked up the contract. Please confirm the requested seat count is accurate."},
    {"id": 19, "expected": "IMPORTANT", "subject": "Design Review: Mobile Navigation Redesign v2", "snippet": "Figma links are updated with feedback from user testing. Please review component specs."},
    {"id": 20, "expected": "IMPORTANT", "subject": "Travel expense reimbursement submitted for approval", "snippet": "Expenses for the Berlin conference ($1,150) have been submitted in Concur for your approval."},

    # NORMAL (10)
    {"id": 21, "expected": "NORMAL", "subject": "Dark mode is now available on desktop 🌙", "snippet": "Flow desktop app now supports dark mode. Toggle it in your Settings panel anytime."},
    {"id": 22, "expected": "NORMAL", "subject": "Weekly Tech Digest: Issue #142", "snippet": "Top articles this week: Rust 2026 release notes, optimizing Postgres queries, and web UI trends."},
    {"id": 23, "expected": "NORMAL", "subject": "Welcome to GitHub Copilot Enterprise!", "snippet": "Here are 5 tips to get started with Copilot in your organization. Explore our documentation guide."},
    {"id": 24, "expected": "NORMAL", "subject": "Company All-Hands Meeting Recording Available", "snippet": "If you missed yesterday's all-hands, the recording and presentation slides are now uploaded to Drive."},
    {"id": 25, "expected": "NORMAL", "subject": "Changelog: Platform Release v2.8.4", "snippet": "Release notes for v2.8.4: bug fixes for table sorting, minor CSS refinements, and faster page loads."},
    {"id": 26, "expected": "NORMAL", "subject": "Your monthly Grammarly activity report", "snippet": "You wrote 45,210 words this month! Here is your vocabulary breakdown and productivity stats."},
    {"id": 27, "expected": "NORMAL", "subject": "Slack: New emoji reactions added to workspace", "snippet": "The workspace admin added 12 new custom emojis. Type :parrot: to check them out."},
    {"id": 28, "expected": "NORMAL", "subject": "Webinar invitation: Scaling Microservices with Kubernetes", "snippet": "Join our free 45-minute live webinar with cloud architects next Wednesday at 10 AM PST."},
    {"id": 29, "expected": "NORMAL", "subject": "Order Confirmation: Receipt #98214 from Office Depot", "snippet": "Thank you for your order. Monitor arm and wireless keyboard will arrive in 3-5 business days."},
    {"id": 30, "expected": "NORMAL", "subject": "Security Tip of the Month: Multi-Factor Authentication", "snippet": "Remember to use hardware security keys or authenticator apps instead of SMS verification."},
]

# --- 2. Generation Scenarios (ROUGE & Deictic Persona Alignment) ---
GEN_SCENARIOS = [
    {
        "id": "gen-1",
        "sender": "David Miller",
        "user_name": "Emily",
        "user_email": "emily@company.com",
        "tone": "professional",
        "input_email": "Hi Emily, can you send over the revised budget spreadsheet for Q3 by tomorrow at noon? We need it before the partner meeting.",
        "gold_reference": "Hi David,\n\nI will review the revised Q3 budget spreadsheet and send it over before noon tomorrow.\n\nBest regards,\nEmily"
    },
    {
        "id": "gen-2",
        "sender": "Sarah Jenkins",
        "user_name": "Emily",
        "user_email": "emily@company.com",
        "tone": "friendly",
        "input_email": "Hey Emily! Are we still on for lunch today at 1 PM at the Italian bistro near the plaza?",
        "gold_reference": "Hey Sarah,\n\nYes, absolutely! I look forward to meeting you at 1 PM at the Italian bistro.\n\nSee you soon,\nEmily"
    },
    {
        "id": "gen-3",
        "sender": "Marcus Vance",
        "user_name": "Emily",
        "user_email": "emily@company.com",
        "tone": "concise",
        "input_email": "Emily, did the client approve the project scope document yet?",
        "gold_reference": "Hi Marcus,\n\nNot yet, I am following up with them today and will let you know once approved.\n\nBest,\nEmily"
    }
]

def query_ollama(model: str, prompt: str, timeout: int = 40) -> tuple[str, float]:
    """Sends prompt to Ollama, returns (text_response, elapsed_seconds)."""
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 180
        }
    }).encode("utf-8")
    
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            elapsed = time.time() - t0
            data = json.loads(res.read().decode("utf-8"))
            return data.get("response", "").strip(), elapsed
    except Exception as e:
        return f"ERROR: {str(e)}", time.time() - t0

def classify_prompt(subject: str, snippet: str) -> str:
    return f"""Classify the urgency of the following email into one of these three exact labels:
- URGENT: immediate crisis, system outage, security breach, or deadline expiring within 24 hours.
- IMPORTANT: direct personal or business message requiring an explicit action or reply from the recipient (e.g. client inquiry, meeting reschedule, pending invoice, manager request).
- NORMAL: general newsletters, product/feature announcements, marketing, digests, changelogs, automated receipts, social updates, and any read-only broadcast info. Feature releases or dark mode announcements MUST ALWAYS be NORMAL.

Rules:
1. Product updates, feature announcements, and newsletters are ALWAYS NORMAL.
2. Read-only notifications without an explicit action item are NORMAL.
3. Only mark IMPORTANT if the email specifically asks the recipient to perform an action.

Subject: {subject}
Snippet: {snippet}

Reply with ONLY ONE WORD from: URGENT, IMPORTANT, NORMAL.
"""

def parse_label(raw: str) -> str:
    cleaned = raw.upper().strip()
    if "URGENT" in cleaned:
        return "URGENT"
    if "IMPORTANT" in cleaned:
        return "IMPORTANT"
    if "NORMAL" in cleaned:
        return "NORMAL"
    return "UNKNOWN"

# --- NLP Scorer Helpers ---
def tokenize(text: str) -> list[str]:
    return re.findall(r'\b\w+\b', text.lower())

def compute_rouge1(cand: str, ref: str) -> float:
    cand_toks = tokenize(cand)
    ref_toks = tokenize(ref)
    if not cand_toks or not ref_toks:
        return 0.0
    cand_counts = {}
    for t in cand_toks:
        cand_counts[t] = cand_counts.get(t, 0) + 1
    ref_counts = {}
    for t in ref_toks:
        ref_counts[t] = ref_counts.get(t, 0) + 1
    
    overlap = sum(min(cand_counts[t], ref_counts[t]) for t in cand_counts if t in ref_counts)
    p = overlap / len(cand_toks)
    r = overlap / len(ref_toks)
    if p + r == 0:
        return 0.0
    return 2 * p * r / (p + r)

def compute_rougel(cand: str, ref: str) -> float:
    cand_toks = tokenize(cand)
    ref_toks = tokenize(ref)
    m, n = len(cand_toks), len(ref_toks)
    if m == 0 or n == 0:
        return 0.0
    
    # DP for LCS
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m):
        for j in range(n):
            if cand_toks[i] == ref_toks[j]:
                dp[i + 1][j + 1] = dp[i][j] + 1
            else:
                dp[i + 1][j + 1] = max(dp[i + 1][j], dp[i][j + 1])
    
    lcs = dp[m][n]
    p = lcs / m
    r = lcs / n
    if p + r == 0:
        return 0.0
    return 2 * p * r / (p + r)

def check_deictic(cand: str, user_name: str) -> bool:
    """True if candidate uses 1st person ('I', 'my', 'me') and does NOT refer to user_name in 3rd person."""
    lower = cand.lower()
    has_first = bool(re.search(r'\b(i|me|my|we|our)\b', lower))
    # 3rd person violation: "Emily should", "Emily is busy", "Emily will"
    third_person_violation = bool(re.search(rf'\b{re.escape(user_name.lower())}\s+(should|is|will|has|can)\b', lower))
    return has_first and not third_person_violation

def run_benchmark():
    models = ["mistral:7b", "qwen2.5:7b"]
    results = {}

    print("=" * 70)
    print("STARTING FACTUAL NLP BENCHMARK ON LOCAL OLLAMA (Mistral vs Qwen)")
    print(f"Dataset: {len(DATASET)} Emails (10 Urgent, 10 Important, 10 Normal)")
    print(f"Generation Scenarios: {len(GEN_SCENARIOS)}")
    print("=" * 70)

    for model in models:
        print(f"\nEvaluating Model: [{model}] ...")
        model_res = {
            "classification": [],
            "latencies": [],
            "confusion_3x3": {"URGENT": {"URGENT": 0, "IMPORTANT": 0, "NORMAL": 0, "UNKNOWN": 0},
                              "IMPORTANT": {"URGENT": 0, "IMPORTANT": 0, "NORMAL": 0, "UNKNOWN": 0},
                              "NORMAL": {"URGENT": 0, "IMPORTANT": 0, "NORMAL": 0, "UNKNOWN": 0}},
            "generation": []
        }

        # 1. Classification Run
        for item in DATASET:
            prompt = classify_prompt(item["subject"], item["snippet"])
            raw, elapsed = query_ollama(model, prompt)
            pred = parse_label(raw)
            model_res["latencies"].append(elapsed)
            
            is_correct = (pred == item["expected"])
            model_res["confusion_3x3"][item["expected"]][pred] += 1
            model_res["classification"].append({
                "id": item["id"],
                "subject": item["subject"],
                "expected": item["expected"],
                "predicted": pred,
                "correct": is_correct,
                "latency_sec": round(elapsed, 3),
                "raw_response": raw[:50]
            })
            status_char = "✓" if is_correct else "✗"
            print(f"  [{status_char}] #{item['id']:02d} [{item['expected']:<9}] -> Pred: [{pred:<9}] in {elapsed:.2f}s ({item['subject'][:40]}...)")

        # 2. Generation Run
        print(f"\n  Running generation scenarios for [{model}] ...")
        for sc in GEN_SCENARIOS:
            gen_prompt = f"""You are {sc['user_name']} ({sc['user_email']}).

Generate a natural email reply to the latest message in the conversation. Write the email directly from your own personal first-person perspective as {sc['user_name']}. Use "I", "me", "my", and sign off with your name ({sc['user_name']}).

Tone: {sc['tone']}

Rules:
1. STRICT FIRST-PERSON PERSPECTIVE: You are {sc['user_name']}. Never refer to {sc['user_name']} in the third person.
2. Use only information present in the email conversation.
3. Do not invent commitments or dates.
4. Return only the reply body.

Conversation:
From: {sc['sender']}
{sc['input_email']}

Reply:"""
            draft, gen_time = query_ollama(model, gen_prompt)
            r1 = compute_rouge1(draft, sc["gold_reference"])
            rl = compute_rougel(draft, sc["gold_reference"])
            deictic_ok = check_deictic(draft, sc["user_name"])

            model_res["generation"].append({
                "id": sc["id"],
                "tone": sc["tone"],
                "draft": draft,
                "gold": sc["gold_reference"],
                "latency_sec": round(gen_time, 3),
                "rouge1": round(r1, 4),
                "rougel": round(rl, 4),
                "deictic_correct": deictic_ok
            })
            print(f"    Scenario [{sc['id']}]: ROUGE-1={r1:.3f}, ROUGE-L={rl:.3f}, Deictic={deictic_ok}, Latency={gen_time:.2f}s")

        results[model] = model_res

    # Output Summary & Metrics
    print("\n" + "=" * 70)
    print("FACTUAL BENCHMARK SUMMARY")
    print("=" * 70)

    summary_metrics = {}
    for model in models:
        m_data = results[model]
        total = len(m_data["classification"])
        correct = sum(1 for c in m_data["classification"] if c["correct"])
        acc = (correct / total) * 100
        avg_lat = sum(m_data["latencies"]) / total

        # Binary Triage: Action (URGENT/IMPORTANT) vs Normal (NORMAL)
        tp = sum(1 for c in m_data["classification"] if c["expected"] in ("URGENT", "IMPORTANT") and c["predicted"] in ("URGENT", "IMPORTANT"))
        fn = sum(1 for c in m_data["classification"] if c["expected"] in ("URGENT", "IMPORTANT") and c["predicted"] == "NORMAL")
        fp = sum(1 for c in m_data["classification"] if c["expected"] == "NORMAL" and c["predicted"] in ("URGENT", "IMPORTANT"))
        tn = sum(1 for c in m_data["classification"] if c["expected"] == "NORMAL" and c["predicted"] == "NORMAL")
        
        bin_acc = (tp + tn) / total * 100
        bin_prec = tp / (tp + fp) * 100 if (tp + fp) else 0
        bin_rec = tp / (tp + fn) * 100 if (tp + fn) else 0
        bin_f1 = (2 * bin_prec * bin_rec) / (bin_prec + bin_rec) if (bin_prec + bin_rec) else 0

        avg_r1 = sum(g["rouge1"] for g in m_data["generation"]) / len(m_data["generation"])
        avg_rl = sum(g["rougel"] for g in m_data["generation"]) / len(m_data["generation"])
        deictic_acc = sum(1 for g in m_data["generation"] if g["deictic_correct"]) / len(m_data["generation"]) * 100
        avg_gen_lat = sum(g["latency_sec"] for g in m_data["generation"]) / len(m_data["generation"])

        summary_metrics[model] = {
            "3_class_accuracy": round(acc, 2),
            "binary_accuracy": round(bin_acc, 2),
            "binary_precision": round(bin_prec, 2),
            "binary_recall": round(bin_rec, 2),
            "binary_f1": round(bin_f1, 2),
            "avg_classify_latency_sec": round(avg_lat, 2),
            "avg_generate_latency_sec": round(avg_gen_lat, 2),
            "avg_rouge1": round(avg_r1, 4),
            "avg_rougel": round(avg_rl, 4),
            "deictic_accuracy": round(deictic_acc, 2),
            "confusion_3x3": m_data["confusion_3x3"],
            "binary_matrix": {"TP": tp, "FN": fn, "FP": fp, "TN": tn}
        }

    # Save to JSON
    out_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "benchmark_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"summary": summary_metrics, "raw": results}, f, indent=2)

    print(f"\nSaved raw data to: {out_path}\n")
    print(json.dumps(summary_metrics, indent=2))

if __name__ == "__main__":
    run_benchmark()
