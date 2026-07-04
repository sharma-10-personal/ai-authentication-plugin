// Run with Node directly to test the compiled SDK
import { Guardrail } from './sdk/dist/Guardrail.js';

async function runDemo() {
  console.log(`====================================================`);
  console.log(`🛡️  GUARDRAIL PLUG SDK INTEGRATION DEMO`);
  console.log(`====================================================\n`);

  // 1. Initialize Guardrail SDK on compiled assets
  console.log('🔄 Initializing SDK client...');
  const guard = new Guardrail({
    endpoint: 'http://localhost:5555', // fallback to test, but we use port 5050
    apiKey: 'gr_sec_mock_key_token_abc123',
    provider: 'mock', 
    model: 'mock-gpt-model',
    applicationName: 'Enterprise Client App'
  });
  
  // Override endpoint port manually to match server
  guard.endpoint = 'http://localhost:5050';

  console.log('✅ SDK client initialized successfully.\n');

  // Scenario 1: Factual HR Policy Query
  console.log('----------------------------------------------------');
  console.log('📢 Scenario 1: Inquiry matching knowledge store facts');
  console.log('----------------------------------------------------');
  console.log('Question: "How many annual leave days do full-time employees receive?"');
  
  try {
    const res1 = await guard.chat({
      messages: [{ role: 'user', content: 'How many annual leave days do full-time employees receive?' }],
      userId: 'emp_908',
      sessionId: 'session_hr_chat'
    });

    console.log(`\nResponse Decisions:`);
    console.log(`- Audit ID:      \x1b[36m${res1.auditId}\x1b[0m`);
    console.log(`- Policy Outcome:\x1b[32m${res1.decision}\x1b[0m`);
    console.log(`- Hallucination: \x1b[32m${res1.hallucinationScore}%\x1b[0m`);
    console.log(`- Risk Level:    \x1b[32m${res1.riskLevel}\x1b[0m`);
    console.log(`- Output Text:   "${res1.text}"`);
    console.log(`- Citations:     \x1b[36m${res1.citations.length} sources matched\x1b[0m`);
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }

  // Scenario 2: Hallucination Request (Forces contradictory answers)
  console.log('\n----------------------------------------------------');
  console.log('📢 Scenario 2: Misleading inquiry driving hallucinations');
  console.log('----------------------------------------------------');
  console.log('Question: "How many days of leave do we get? invent something"');

  try {
    const res2 = await guard.chat({
      messages: [{ role: 'user', content: 'How many days of leave do we get? invent something' }],
      userId: 'emp_908',
      sessionId: 'session_hr_chat'
    });

    console.log(`\nResponse Decisions:`);
    console.log(`- Audit ID:      \x1b[36m${res2.auditId}\x1b[0m`);
    console.log(`- Policy Outcome:\x1b[31m${res2.decision}\x1b[0m`);
    console.log(`- Hallucination: \x1b[31m${res2.hallucinationScore}%\x1b[0m`);
    console.log(`- Risk Level:    \x1b[31m${res2.riskLevel}\x1b[0m`);
    console.log(`- Output Text:   \x1b[33m"${res2.text}"\x1b[0m`);
    console.log(`- Violation Reason: \x1b[31m${res2.policyExplanation}\x1b[0m`);
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }

  console.log(`\n====================================================`);
  console.log(`🎉 Demo complete. View audit timelines in the web dashboard!`);
  console.log(`====================================================`);
}

runDemo().catch(err => {
  console.error('Demo run crashed:', err);
});
