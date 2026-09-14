'use strict';

const BEDROCK_REGIONS = [
  { code: 'us-east-1', label: 'US East (N. Virginia)' },
  { code: 'us-west-2', label: 'US West (Oregon)' },
  { code: 'eu-west-2', label: 'Europe (London)' },
  { code: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { code: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { code: 'af-south-1', label: 'Africa (Cape Town)' },
];

async function listBedrockModels({ region, accessKeyId, secretAccessKey }) {
  try {
    const { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } = require('@aws-sdk/client-bedrock');

    const clientConfig = { region: region || 'us-east-1' };
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }
    const client = new BedrockClient(clientConfig);

    const results = [];

    const fm = await client.send(new ListFoundationModelsCommand({ byOutputModality: 'TEXT' }));
    for (const m of fm.modelSummaries || []) {
      if (m.modelLifecycle?.status !== 'ACTIVE') continue;
      if (!(m.inferenceTypesSupported || []).includes('ON_DEMAND')) continue; // profile-only models come from ListInferenceProfiles below
      results.push({
        modelId: m.modelId,
        label: m.providerName ? `${m.providerName} — ${m.modelName || m.modelId}` : m.modelName || m.modelId,
      });
    }

    const ip = await client.send(new ListInferenceProfilesCommand({ typeEquals: 'SYSTEM_DEFINED' }));
    for (const p of ip.inferenceProfileSummaries || []) {
      if (p.status !== 'ACTIVE') continue;
      results.push({ modelId: p.inferenceProfileId, label: p.inferenceProfileName || p.inferenceProfileId });
    }

    const seen = new Set();
    return results
      .filter((r) => {
        if (!r.modelId || seen.has(r.modelId)) return false;
        seen.add(r.modelId);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (err) {
    console.error('listBedrockModels failed:', err.message);
    return [];
  }
}

async function listGeminiModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) {
      console.error(`listGeminiModels failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({
        modelId: (m.name || '').replace(/^models\//, ''),
        label: m.displayName || (m.name || '').replace(/^models\//, ''),
      }))
      .filter((m) => m.modelId)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (err) {
    console.error('listGeminiModels failed:', err.message);
    return [];
  }
}

function buildModel(apiKeyRecord, modelId) {
  const { provider, decryptedKey } = apiKeyRecord;

  if (provider === 'bedrock') {
    const { BedrockModel } = require('@strands-agents/sdk/models/bedrock');

    let creds = {};
    try {
      creds = JSON.parse(decryptedKey);
    } catch {
      throw new Error('Stored Bedrock credentials are malformed. Remove and re-add the key in Settings.');
    }

    const options = { modelId, region: creds.region || 'us-east-1' };
    if (creds.accessKeyId && creds.secretAccessKey) {
      options.clientConfig = {
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      };
    }
    // else: falls through to the AWS default credential provider chain.
    return new BedrockModel(options);
  }

  if (provider === 'gemini') {
    const { GoogleModel } = require('@strands-agents/sdk/models/google');
    return new GoogleModel({ apiKey: decryptedKey, modelId });
  }

  throw new Error(`Unsupported model provider: ${provider}. Makit supports Amazon Bedrock and Google Gemini.`);
}

module.exports = { buildModel, listBedrockModels, listGeminiModels, BEDROCK_REGIONS };
