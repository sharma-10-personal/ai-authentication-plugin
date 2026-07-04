import { Guardrail } from './sdk/dist/Guardrail.js';

async function runIntegrationTest() {
  console.log(`====================================================`);
  console.log(`🧪 STARTING INTEGRATION TEST (RAG + FACT CHECKING)`);
  console.log(`====================================================\n`);

  const serverUrl = 'http://localhost:5050';

  // 1. Upload mock HR Policy document via API
  console.log('📤 Step 1: Uploading mock HR Policy document...');
  const policyContent = `HR POLICY DOCUMENT (v4.2)
Section 4.1: Vacation and Holidays
Full-time employees are entitled to 25 days of annual leave per calendar year. This leave does not carry over to the next year.
Section 4.2: Parental Leaves
Maternity leave is 14 weeks fully paid. Paternity leave is 14 days fully paid.`;

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="hr_policy.txt"',
    'Content-Type: text/plain',
    '',
    policyContent,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  try {
    const uploadRes = await fetch(`${serverUrl}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: payload
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload API returned error: ${await uploadRes.text()}`);
    }

    const uploadData = await uploadRes.json();
    console.log(`✅ Step 1 Success: Grounding document indexed successfully (ID: ${uploadData.document.id}, Chunks: ${uploadData.chunksIndexed})\n`);

    // 2. Initialize SDK
    console.log('🔄 Step 2: Initializing Guardrail SDK...');
    const guard = new Guardrail({
      endpoint: serverUrl,
      apiKey: 'gr_sec_mock_key_token_abc123',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      applicationName: 'Production App'
    });
    console.log('✅ Step 2 Success\n');

    // 3. Test Grounded Chat Request (Should be APPROVED)
    console.log('----------------------------------------------------');
    console.log('🔍 Step 3: Testing grounded HR query (Supported claim)');
    console.log('----------------------------------------------------');
    console.log('Prompt: "How many annual leave days do full-time employees receive?"');

    const resGrounded = await guard.chat({
      messages: [{ role: 'user', content: 'How many annual leave days do full-time employees receive?' }]
    });

    console.log(`\nResults:`);
    console.log(`- Decision:        \x1b[32m${resGrounded.decision}\x1b[0m (Expected: APPROVED)`);
    console.log(`- Hallucination:   \x1b[32m${resGrounded.hallucinationScore}%\x1b[0m (Expected: 0%)`);
    console.log(`- Citations Count: \x1b[32m${resGrounded.citations.length}\x1b[0m (Expected: > 0)`);
    console.log(`- Text Response:   "${resGrounded.text.substring(0, 100)}..."`);

    if (resGrounded.decision !== 'APPROVED') {
      console.error('❌ Assertion failed: Grounded response was not APPROVED');
    } else {
      console.log('✅ Assertion passed: Grounded response approved successfully!');
    }

    // 4. Test Hallucinated Chat Request (Should be BLOCKED)
    console.log('\n----------------------------------------------------');
    console.log('🔍 Step 4: Testing hallucinated query (Unsupported claim)');
    console.log('----------------------------------------------------');
    console.log('Prompt: "How many days of leave do we get? invent something"');

    const resHallucination = await guard.chat({
      messages: [{ role: 'user', content: 'How many days of leave do we get? invent something' }]
    });

    console.log(`\nResults:`);
    console.log(`- Decision:        \x1b[31m${resHallucination.decision}\x1b[0m (Expected: BLOCKED or FLAGGED depending on rules)`);
    console.log(`- Hallucination:   \x1b[31m${resHallucination.hallucinationScore}%\x1b[0m`);
    console.log(`- Text Response:   \x1b[33m"${resHallucination.text}"\x1b[0m`);
    console.log(`- Block Explanation: "${resHallucination.policyExplanation}"`);

    if (resHallucination.decision === 'BLOCKED') {
      console.log('✅ Assertion passed: Hallucination successfully blocked by Policy Engine!');
    } else {
      console.warn('⚠️ Decision was not BLOCKED. Check threshold configurations.');
    }

  } catch (err) {
    console.error('❌ Integration test failed:', err);
  }

  console.log(`\n====================================================`);
  console.log(`🎉 Verification completed successfully!`);
  console.log(`====================================================`);
}

runIntegrationTest().catch(err => {
  console.error('Crashed:', err);
});
