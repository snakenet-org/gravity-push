import * as core from '@actions/core';

async function sendNotification(baseUrl, apiKey, gravityToken, body) {
  const url = new URL('/api/v1/notify/send', baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Ophion-Token': gravityToken,
    },
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
    const pushServiceUrl = core.getInput('push_service_url', { required: true });
    const apiKey = core.getInput('api_key', { required: true });
    const gravityToken = core.getInput('gravity_token', { required: true });
    const pushTopicId = core.getInput('push_topic_id', { required: true });
    const pushMessageTitle = core.getInput('push_message_title', { required: true });
    const pushMessageBody = core.getInput('push_message_body', { required: true });
    const pushMessageUrl = core.getInput('push_message_url');

    core.setSecret(apiKey);
    core.setSecret(gravityToken);

    // 2. Send the push notification
    core.startGroup('Send push notification');
    const sendBody = {
      topic_id: pushTopicId,
      title: pushMessageTitle,
      body: pushMessageBody,
    };
    if (pushMessageUrl) {
      sendBody.url = pushMessageUrl;
    }
    const sendResult = await sendNotification(pushServiceUrl, apiKey, gravityToken, sendBody);
    console.log('Send response:', JSON.stringify(sendResult));
    core.endGroup();

    // 3. Set the output variables
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
