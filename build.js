const fs = require("fs");
const path = require("path");

const directory_data = path.join(__dirname, "./data/");
const directory_accounts = path.join(directory_data + "accounts/");
const directory_anonymous = path.join(directory_data + "anonymous/");
const directory_contacts = path.join(directory_data + "contacts/");
const directory_conversations = path.join(directory_data + "conversations/");
const directory_keys = path.join(directory_data + "keys/");
const directory_keys_public = path.join(directory_keys + "public/");
const directory_keys_private = path.join(directory_keys + "private/");
const directory_settings = path.join(directory_data + "settings/");
const directories = [directory_data, directory_accounts, directory_anonymous, directory_contacts, directory_conversations, directory_keys, directory_keys_public, directory_keys_private, directory_settings];

for(i = 0; i < directories.length; i++) {
	if(!fs.existsSync(directories[i])) {
		fs.mkdirSync(directories[i]);
	}
}