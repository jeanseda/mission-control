#!/bin/bash
# Business Intelligence Daily Update
# Runs daily at 8 AM EST to update business metrics and send alerts

set -e

WORKSPACE="/Users/jeanseda/.openclaw/workspace"
BUSINESS_FILE="$WORKSPACE/mission-control/data/business-metrics.json"
CURRENT_MONTH=$(date +%Y-%m)

echo "🔄 Business Intelligence Update - $(date)"

# Read current metrics
if [ ! -f "$BUSINESS_FILE" ]; then
    echo "❌ Business metrics file not found"
    exit 1
fi

# Calculate client health scores
# Health = 100 - (days since last contact * 5)
# If > 14 days since contact, score < 50 (alert threshold)

python3 - <<EOF
import json
import datetime
import sys

try:
    with open('$BUSINESS_FILE', 'r') as f:
        data = json.load(f)
    
    today = datetime.date.today()
    current_month = today.strftime('%Y-%m')
    alerts = []
    
    # Update client health scores
    for client in data['clients']:
        last_contact = datetime.datetime.strptime(client['last_contact'], '%Y-%m-%d').date()
        days_since_contact = (today - last_contact).days
        
        # Health score calculation
        health_score = max(0, 100 - (days_since_contact * 5))
        client['health_score'] = health_score
        
        # Alert if health score < 50
        if health_score < 50 and client['status'] in ['active', 'onboarding']:
            alerts.append({
                'id': f"health-{client['id']}-{int(datetime.datetime.now().timestamp())}",
                'type': 'client_health',
                'severity': 'critical' if health_score < 30 else 'warning',
                'message': f"⚠️ Client {client['name']} needs attention - no contact in {days_since_contact} days (health: {health_score}%)",
                'created_at': datetime.datetime.now().isoformat(),
                'resolved': False
            })
    
    # Check pipeline for stuck deals
    for deal in data['pipeline']:
        if deal['stage'] not in ['closed_won', 'closed_lost']:
            created = datetime.datetime.fromisoformat(deal['created_at'].replace('Z', '+00:00')).date()
            days_in_pipeline = (today - created).days
            
            if days_in_pipeline > 30 and deal['value'] > 500:
                alerts.append({
                    'id': f"pipeline-{deal['id']}-{int(datetime.datetime.now().timestamp())}",
                    'type': 'pipeline',
                    'severity': 'warning',
                    'message': f"📊 Deal '{deal['name']}' stuck in pipeline for {days_in_pipeline} days (value: \${deal['value']})",
                    'created_at': datetime.datetime.now().isoformat(),
                    'resolved': False
                })
    
    # Check for new leads in last 7 days
    recent_leads = [d for d in data['pipeline'] 
                   if d['stage'] == 'lead' 
                   and (today - datetime.datetime.fromisoformat(d['created_at'].replace('Z', '+00:00')).date()).days <= 7]
    
    if len(recent_leads) == 0:
        # Check if ANY lead exists in last 7 days
        all_recent = [d for d in data['pipeline']
                     if (today - datetime.datetime.fromisoformat(d['created_at'].replace('Z', '+00:00')).date()).days <= 7]
        if len(all_recent) == 0:
            alerts.append({
                'id': f"leads-{int(datetime.datetime.now().timestamp())}",
                'type': 'leads',
                'severity': 'info',
                'message': "ℹ️ No new leads added in the last 7 days",
                'created_at': datetime.datetime.now().isoformat(),
                'resolved': False
            })
    
    # Check revenue progress
    data['goal']['current_month'] = current_month
    
    # Calculate MRR
    mrr = sum(c['mrr'] for c in data['clients'] 
             if c['type'] == 'recurring' and c['status'] in ['active', 'onboarding'])
    data['goal']['mrr'] = mrr
    
    # Calculate one-time for current month
    one_time = sum(h['amount'] for h in data['history']
                  if h['date'].startswith(current_month) and h['type'] == 'one_time')
    data['goal']['one_time'] = one_time
    
    # Total
    total = mrr + one_time
    data['goal']['total'] = total
    data['goal']['progress_percent'] = (total / data['goal']['monthly_target']) * 100
    
    # Alert if revenue trending low (> 20% below target)
    days_in_month = today.day
    days_total = (datetime.date(today.year, today.month % 12 + 1, 1) - datetime.timedelta(days=1)).day
    expected_progress = (days_in_month / days_total) * 100
    
    if data['goal']['progress_percent'] < (expected_progress - 20):
        alerts.append({
            'id': f"revenue-{int(datetime.datetime.now().timestamp())}",
            'type': 'revenue',
            'severity': 'warning',
            'message': f"💰 Revenue trending below target: \${total}/\${data['goal']['monthly_target']} ({data['goal']['progress_percent']:.1f}% vs expected {expected_progress:.1f}%)",
            'created_at': datetime.datetime.now().isoformat(),
            'resolved': False
        })
    
    # Add new alerts (don't clear old ones)
    existing_alert_messages = {a['message'] for a in data.get('alerts', []) if not a.get('resolved')}
    for alert in alerts:
        if alert['message'] not in existing_alert_messages:
            data.setdefault('alerts', []).append(alert)
    
    # Update last_updated
    data['last_updated'] = datetime.datetime.now().isoformat()
    
    # Write back
    with open('$BUSINESS_FILE', 'w') as f:
        json.dump(data, f, indent=2)
    
    # Print summary
    print(f"✅ Business metrics updated")
    print(f"   MRR: \${mrr}")
    print(f"   Total this month: \${total}")
    print(f"   Progress: {data['goal']['progress_percent']:.1f}%")
    print(f"   Active clients: {len([c for c in data['clients'] if c['status'] in ['active', 'onboarding']])}")
    print(f"   New alerts: {len(alerts)}")
    
    # If critical alerts, print them
    if alerts:
        print(f"\n🚨 Alerts:")
        for alert in alerts:
            print(f"   {alert['message']}")
    
    sys.exit(0)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
EOF

echo "✅ Business intelligence update complete"
