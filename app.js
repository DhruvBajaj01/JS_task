const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { Buffer } = require('buffer');

const app = express();

const CLIENT_ID =
	'288700057470-g0svhjpi310npkrdd3dmo4bsn1opfupf.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:8001/oauth2callback';

// Scopes that we need for Gmail API
const SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/gmail.compose',
	'https://www.googleapis.com/auth/gmail.modify',
];

// Set up OAuth credentials
const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Set up Gmail API client
const gmail = google.gmail({
	version: 'v1',
	auth: oAuth2Client,
});

// Labels for labeling the emails
const LABEL_NAME = 'Auto-Replied';

// Authenticate the app and obtain an access token for the Gmail API

// Authenticate the app and start running it
const url = oAuth2Client.generateAuthUrl({
	access_type: 'offline',
	scope: SCOPES,
	prompt: 'consent',
});

app.get('/', async (req, res) => {
	res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
	const { code } = req.query;

	await authenticate(code);
	runApp();
});

async function authenticate(code) {
	const { tokens } = await oAuth2Client.getToken(code);
	oAuth2Client.setCredentials(tokens);
}

async function checkEmails() {
	//const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

	try {
		const response = await gmail.users.messages.list({
			userId: 'me',
			labelIds: ['INBOX'],
			q: 'is:unread',
		});

		if (response.data.resultSizeEstimate) {
			const messages = response.data.messages;

			for (const message of messages) {
				const email = await gmail.users.messages.get({
					userId: 'me',
					id: message.id,
				});

				const headers = email.data.payload.headers;
				let subject = '';
				let from = '';
				for (const header of headers) {
					if (header.name === 'Subject') {
						subject = header.value;
					}
					if (header.name === 'From') {
						from = header.value;
					}
				}

				const threadId = email.data.threadId;
				const threadResponse = await gmail.users.threads.get({
					userId: 'me',
					id: threadId,
				});
				const thread = threadResponse.data;
				const messagesInThread = thread.messages;
				let hasReplied = false;
				for (const messageInThread of messagesInThread) {
					if (messageInThread.labelIds.includes('SENT')) {
						hasReplied = true;
						break;
					}
				}

				if (!hasReplied) {
					// Send a reply to the first message in the thread
					const messageInThread = messagesInThread[0];
					const to = from;
					const body =
						'Thank you for your message. This is an automatic reply.';
					const message = [
						`To: ${to}`,
						'Content-Type: text/html; charset=utf-8',
						'MIME-Version: 1.0',
						'Subject: Re: ' + subject,
						'',
						body,
					].join('\n');
					const encodedMessage = Buffer.from(message).toString('base64');
					await gmail.users.messages.send({
						userId: 'me',
						requestBody: {
							raw: encodedMessage,
							threadId: threadId,
						},
					});

					// Label the thread and move it to the label
					let labelId = null;
					const labelsResponse = await gmail.users.labels.list({
						userId: 'me',
					});
					const labels = labelsResponse.data.labels;
					for (const label of labels) {
						if (label.name === LABEL_NAME) {
							labelId = label.id;
							break;
						}
					}
					if (!labelId) {
						const labelResponse = await gmail.users.labels.create({
							userId: 'me',
							requestBody: {
								name: LABEL_NAME,
							},
						});
						labelId = labelResponse.data.id;
					}
					await gmail.users.threads.modify({
						userId: 'me',
						id: threadId,
						requestBody: {
							addLabelIds: [labelId],
							removeLabelIds: ['INBOX'],
						},
					});
					console.log(`Replied to "${subject}" from ${from} and added label.`);
				}
			}
		} else {
			console.log('No new emails to check.');
		}
	} catch (error) {
		console.error(error);
	}

	// Check for new emails again after a random interval of 45 to 120 seconds
	//const interval = Math.floor(Math.random() * (120 - 45 + 1)) + 45;
	//setTimeout(checkEmails, interval * 1000);
}
// Run the app in random intervals between 45-120 seconds
function runApp() {
	const randomInterval = Math.floor(Math.random() * (120 - 45 + 1)) + 45;
	setTimeout(async () => {
		await checkEmails();
		runApp();
	}, randomInterval * 1000);
}

app.listen(8001, () => console.log('Server running on port 8001'));