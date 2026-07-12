import * as core from '@actions/core';

// Fixed, not configurable — see README.
const M2M_GRANT_TYPE = 'client_credentials';
const M2M_SCOPE = 'openid profile groups';

function defaultDeviceIdentity() {
  const repo = process.env.GITHUB_REPOSITORY ?? 'unknown/unknown';
  const workflow = process.env.GITHUB_WORKFLOW ?? 'unknown';
  return `github-actions:${repo}/${workflow}`;
}

async function authenticate(identityProviderUrl, clientId, username, password) {
  const response = await fetch(identityProviderUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: M2M_GRANT_TYPE,
      client_id: clientId,
      username,
      password,
      scope: M2M_SCOPE,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${identityProviderUrl} failed with HTTP ${response.status}: ${text}`);
  }
  const data = text ? JSON.parse(text) : {};
  if (!data.access_token) {
    throw new Error('Identity provider response did not contain an access_token');
  }
  return data.access_token;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function run() {
  try {
    // 1. Get input values from the workflow
    const identityProviderUrl = core.getInput('identity_provider_url', { required: true });
    const m2mClientId = core.getInput('m2m_client_id', { required: true });
    const m2mUsername = core.getInput('m2m_username', { required: true });
    const m2mPassword = core.getInput('m2m_password', { required: true });
    const pushServiceUrl = core.getInput('push_service_url', { required: true });
    const pushServiceToken = core.getInput('push_service_token', { required: true });
    const pushTopicId = core.getInput('push_topic_id', { required: true });
    const pushMessageTitle = core.getInput('push_message_title', { required: true });
    const pushMessageBody = core.getInput('push_message_body', { required: true });
    const pushMessageUrl = core.getInput('push_message_url');
    const deviceIdentity = core.getInput('device_identity') || defaultDeviceIdentity();

    core.setSecret(m2mPassword);
    core.setSecret(pushServiceToken);

    const baseUrl = pushServiceUrl.replace(/\/+$/, '');

    // 2. Authenticate against snakeNet ID
    core.startGroup('Authenticate against snakeNet ID');
    const accessToken = await authenticate(identityProviderUrl, m2mClientId, m2mUsername, m2mPassword);
    core.setSecret(accessToken);
    console.log('Obtained access token.');
    core.endGroup();

    const authHeaders = {
      'X-Ophion-Token': pushServiceToken,
      Authorization: `Bearer ${accessToken}`,
    };

    // 3. Self-provision this M2M client against Gravity
    core.startGroup('Provision against Gravity');
    const provisionResult = await postJson(`${baseUrl}/api/v1/auth/m2m/provision`, authHeaders, {
      device_identity: deviceIdentity,
    });
    console.log('Provision response:', JSON.stringify({
      message: provisionResult.message,
      id: provisionResult.id,
      created: provisionResult.created,
      device_added: provisionResult.device_added,
      entitlements: provisionResult.entitlements,
      is_admin: provisionResult.is_admin,
    }));
    core.endGroup();

    // 4. Send the push notification
    core.startGroup('Send push notification');
    const sendBody = {
      topic_id: pushTopicId,
      title: pushMessageTitle,
      body: pushMessageBody,
    };
    if (pushMessageUrl) {
      sendBody.url = pushMessageUrl;
    }
    const sendResult = await postJson(`${baseUrl}/api/v1/push/send`, authHeaders, sendBody);
    console.log('Send response:', JSON.stringify(sendResult));
    core.endGroup();

    // 5. Set the output variables
    core.setOutput('subscribers', sendResult.subscribers);
    core.setOutput('sent', sendResult.sent);
    core.setOutput('failed', sendResult.failed);
    core.setOutput('pruned', sendResult.pruned);
    console.log(
      `Sent to topic ${pushTopicId}: ${sendResult.sent}/${sendResult.subscribers} delivered, ` +
        `${sendResult.failed} failed, ${sendResult.pruned} pruned.`
    );
  } catch (error) {
    // Fail the GitHub Action step if anything goes wrong
    core.setFailed(`Gravity push failed: ${error.message}`);
  }
}

run();
