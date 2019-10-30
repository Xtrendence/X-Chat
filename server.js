const port = 80;

const express = require("express");
const session = require("express-session");
const app = express();
const server = app.listen(port);

const fs = require("fs");
const path = require("path");
const io = require("socket.io")(server);
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const crypto_js = require("crypto-js");
const body_parser = require("body-parser");

// Redis is used by Socket.IO to store data.
const redis = require("redis");
const redis_client = redis.createClient();
const redis_store = require("connect-redis")(session);

redis_client.on("error", function(err) {
	console.log("Redis Error: ", err);
});

var session_mware = session({
	secret: generate_token(),
	resave: false,
	saveUninitialized: true,
	cookie: { secure: false },
	store: new redis_store({ host: 'localhost', port: 6379, client: redis_client, ttl: 86400 })
});

app.use(session_mware);

app.set("view engine", "ejs");
app.use("/assets", express.static("assets"));
app.use(body_parser.urlencoded({ extended: true }));
app.use(body_parser.json());

// Create required directories.
directory_check();

// The server's root directory. If the user is logged in, they'll see the main chat page, otherwise, they'll be shown the login page.
app.get("/", function(req, res) {
	if(req.session.logged_in) {
		res.render("home", { username: req.session.username, });
	}
	else {
		res.render("login");
	}
});
// Accessing the anonymous chat automatically logs out the user.
app.get("/anonymous", function(req, res) {
	req.session.logged_in = 0;
	req.session.anonymous = 1;
	req.session.anonymous_id = "";
	req.session.username = "";
	res.render("anonymous");
});
// To login, the user can send a POST request with their username and password to "/login".
app.post("/login", function(req, res) {
	var username = req.body.username;
	var password = req.body.password;
	if(!empty(username) && !empty(password)) {
		// Gets the SHA256 hash of the user's username.
		var username_hash = crypto.createHash("sha256").update(username.toLowerCase()).digest("hex");
		var account_file = path.join(__dirname, "./data/accounts/" + username.toLowerCase() + ".txt");
		var public_key_file = path.join(__dirname, "./data/keys/public/" + username_hash + ".txt");
		var private_key_file = path.join(__dirname, "./data/keys/private/" + username_hash + ".txt");
		// If the user's account file exists, it is opened, and its JSON content is parsed into an object.
		if(fs.existsSync(account_file)) {
			fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
				if(!error) {
					if(!empty(json)) {
						var account = JSON.parse(json);
						// The user's password from the POST request is compared to their valid one that's encrypted using BCrypt, and stored on the server.
						bcrypt.compare(password, account["password"], function(error, valid) {
							// If the password is correct, the user is logged in, and their session variables are declared.
							if(valid) {
								req.session.logged_in = 1;
								req.session.anonymous = 0;
								req.session.username = account["username"];
								// The user is then sent their public key, and private key (to be decrypted on the client side).
								fs.readFile(private_key_file, { encoding:"utf-8" }, function(error, private_key) {
									if(error) {
										console.log(error);
									}
									else {
										fs.readFile(public_key_file, { encoding:"utf-8" }, function(error, public_key) {
											if(error) {
												console.log(error);
											}
											else {
												res.send(JSON.stringify({action:"refresh", private_key:private_key, public_key:public_key}));
											}
										});
									}
								});
							}
							else {
								res.send(JSON.stringify({text:"Invalid credentials."}));
							}
						});
					}
					else {
						res.send(JSON.strinigfy({text:"Invalid account file."}));
					}
				}
				else {
					console.log(error);
				}
			});
		}
		else {
			res.send(JSON.stringify({text:"Account not found."}));
		}
	}
});
// To register, the user can send a POST request containing their username and password to "/register".
app.post("/register", function(req, res) {
	var username = req.body.username;
	var password = req.body.password;
	if(!empty(username) && !empty(password)) {
		// A hash of the user's username and password are created.
		var username_hash = crypto.createHash("sha256").update(username.toLowerCase()).digest("hex");
		var password_hash = crypto.createHash("sha512").update(password).digest("hex");
		var account_file = path.join(__dirname, "./data/accounts/" + username.toLowerCase() + ".txt");
		var public_key_file = path.join(__dirname, "./data/keys/public/" + username_hash + ".txt");
		var private_key_file = path.join(__dirname, "./data/keys/private/" + username_hash + ".txt");
		// If an account file under the user's username already exists, the user is informed of it.
		if(fs.existsSync(account_file)) {
			res.send("Account already exists.");
		}
		else {
			// Only letters and numbers are allowed in usernames.
			if(alphanumeric(username)) {
				// Usernames have to be less than 14 characters long.
				if(username.length > 14) {
					res.send("Username is too long.");
				}
				else {
					// The user's password is hashed using BCrypt.
					bcrypt.hash(password, 10, function(error, hash) {
						if(error) {
							console.log(error);
						}
						else {
							var account = {"username":username, "password":hash, "conversations":{}};
							if(!empty(account)) {
								fs.writeFile(account_file, JSON.stringify(account), function(error) {
									if(error) {
										console.log(error);
									}
									else {
										if(fs.existsSync(account_file)) {
											var settings_file = path.join(__dirname, "./data/settings/" + username.toLowerCase() + ".txt");
											var settings = {"starting-conversations":"anybody", "message-notification":"enabled", "conversation-notification":"enabled", "chat-scrolling":"enabled", "conversation-sorting":"newest", "interface":"dark"};
											fs.writeFile(settings_file, JSON.stringify(settings), function(error) {
												if(error) {
													console.log(error);
												}
												else {
													// A public key and private key are generated for the user.
													crypto.generateKeyPair("rsa", {
														modulusLength:2048,
														publicKeyEncoding: {
															type:"spki",
															format:"pem"
														},
														privateKeyEncoding: {
															type:"pkcs8",
															format:"pem"
														}
													}, function(error, public_key, private_key) {
														if(error) {
															console.log(error);
														}
														else {
															// The user's private key is encrypted using the hash of their password as the encryption key.
															var private_key_encrypted = aes_encrypt(private_key, password_hash);
															fs.writeFile(public_key_file, public_key, function(error) {
																if(error) {
																	console.log(error);
																}
																else {
																	fs.writeFile(private_key_file, private_key_encrypted, function(error) {
																		if(error) {
																			console.log(error);
																		}
																		else {
																			// If the public key and private key files exist, then the registration is complete.
																			if(fs.existsSync(public_key_file) && fs.existsSync(private_key_file) && !empty(public_key) && !empty(private_key_encrypted)) {
																				res.send("done");
																			}
																			// If the aforementioned files do not exist, then all the previously created files are deleted, and the user is told to try again.
																			else {
																				fs.unlink(account_file, function(error) {
																					if(error) {
																						console.log(error);
																					}
																				});
																				fs.unlink(public_key_file, function(error) {
																					if(error) {
																						console.log(error);
																					}
																				});
																				fs.unlink(private_key_file, function(error) {
																					if(error) {
																						console.log(error);
																					}
																				});
																				fs.unlink(settings_file, function(error) {
																					if(error) {
																						console.log(error);
																					}
																				});
																				res.send("Error. Try again.");
																			}
																		}
																	});
																}
															});
														}
													});
												}
											});
										}
									}
								});
							}
						}
					});
				}
			}
			else {
				res.send("Letters and numbers only.");
			}
		}
	}
});
// The user can send a POST request to "/settings" to fetch their settings/preferences.
app.post("/settings", function(req, res) {
	if(req.session.logged_in) {
		var username = req.session.username.toLowerCase();
		var settings_file = path.join(__dirname, "./data/settings/" + username + ".txt");
		if(fs.existsSync(settings_file)) {
			fs.readFile(settings_file, function(error, json) {
				if(error) {
					console.log(error);
				}
				else {
					if(!empty(json)) {
						res.send(json);
					}
					else {
						res.send("Invalid settings file content.");
					}
				}
			});
		}
	}
});
// Logging out.
app.post("/logout", function(req, res) {
	req.session.logged_in = 0;
	req.session.anonymous = 0;
	req.session.anonymous_id = "";
	req.session.username = "";
	res.send("refresh");
});
// To get access to the session, Socket.IO uses a session middleware.
io.use(function(socket, next) {
	session_mware(socket.request, socket.request.res, next);
});
// An object containing a list of anonymous users' IDs.
var anonymous_clients = new Object();
// An object containing a list of conversation IDs and their participants' anonymous IDs.
var anonymous_chats = new Object();
// An object containing a list of normal users.
var clients = new Object();
// An object containing a list of normal chats and their participants.
var current_chats = new Object();
io.sockets.on("connection", function(socket) {
	if(!empty(socket.request.session.username) && socket.request.session.logged_in && !socket.request.session.anonymous) {
		// If the current_chats object already contains the user's username, then Socket.IO just connects to the chat the user's supposed to be connected to.
		if(!empty(current_chats[socket.request.session.username.toLowerCase()])) {
			socket.join(current_chats[socket.request.session.username.toLowerCase()]);
		}
		// The client object consists of the user's username, and their Socket ID. Since the Socket ID changes frequently, this is a way to always keep track of it.
		var client = { [socket.request.session.username.toLowerCase()]:socket.id };
		// If the user is found in the clients object, then their Socket ID is just updated.
		if(socket.request.session.username.toLowerCase() in clients) {
			clients[socket.request.session.username.toLowerCase()] = socket.id;
		}
		// If they aren't found in the clients object, then they're added to it.
		else {
			clients = Object.assign(clients, client);
		}
		var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
		// Fetching a list of conversations that the user is a part of.
		socket.on("list-conversations", function() {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
				if(!error) {
					if(!empty(json)) {
						var account = JSON.parse(json);
						var conversation_list = account["conversations"];
						var list = new Object();
						// Automatically remove conversation IDs from the user's account file if the conversation file associated with the ID doesn't exist.
						if(!empty(conversation_list)) {
							var auto_check = true;
							if(auto_check) {
								var keys = Object.keys(conversation_list);
								for(i = 0; i < keys.length; i++) {
									if(account["conversations"][keys[i]]["visibility"] == true) {
										var conversation_file = path.join(__dirname, "./data/conversations/" + keys[i] + ".txt");
										var conversation_object = account["conversations"][keys[i]];
										var file_info = fs.statSync(conversation_file);
										var file_mtime = to_epoch(file_info.mtime);
										var time_object = { modified:file_mtime };
										Object.assign(conversation_object, { modified:file_mtime });
										var conversation = { [keys[i]]:conversation_object };
										Object.assign(list, conversation);
									}
									if(!fs.existsSync(path.join(__dirname, "./data/conversations/" + keys[i] + ".txt"))) {
										delete account["conversations"][keys[i]];
										// If the conversation ID stored in the user's account file doesn't actually have a corresponding file, then the user's account file is updated to reflect that fact.
										var overwrite = true;
									}
								}
								io.to(clients[socket.request.session.username.toLowerCase()]).emit("list-conversations", { content:list });
								if(overwrite) {
									if(!empty(account)) {
										fs.writeFile(account_file, JSON.stringify(account), function(error) {
											if(error) {
												console.log(error);
											}
										});
									}
								}
							}
						}
					}
				} 
				else {
					console.log(error);
				}
			});
		});
		// Fetch the contents of a conversation.
		socket.on("fetch-conversation", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.id + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							var recipient_name = account["conversations"][data.id]["name"];
							var recipient_public_key_file = path.join(__dirname, "./data/keys/public/" + crypto.createHash("sha256").update(recipient_name.toLowerCase()).digest("hex") + ".txt");
							if(!empty(account["conversations"][data.id])) {
								if(account["conversations"][data.id]["visibility"] == true) {
									fs.readFile(conversation_file, { encoding:"utf-8" }, function(error, json) {
										if(!error) {
											fs.readFile(recipient_public_key_file, { encoding:"utf-8" }, function(error, recipient_public_key) {
												if(error) {
													console.log(error);
												}
												else {
													// Get a SHA256 hash of the conversation ID, and then join it using Socket.IO.
													var hash = crypto.createHash("sha256").update(data.id).digest("base64");
													delete current_chats[socket.request.session.username.toLowerCase()];
													var current_chat = { [socket.request.session.username.toLowerCase()]:hash };
													Object.assign(current_chats, current_chat);
													socket.join(hash);
													if(!empty(json)) {
														// To ensure that HTML elements cannot be added to messages.
														var formatted = json.replace_all("<", "&lt;").replace_all(">", "&gt;");
														var messages = JSON.parse(formatted);
														var output = new Object();
														var keys = Object.keys(messages);
														for(i = 0; i < keys.length; i++) {
															// When a user deletes a message, it is only hidden for them, until the other user deletes it as well, in which case it'll get deleted from the server.
															if(messages[keys[i]]["visibility"][socket.request.session.username.toLowerCase()] == true) {
																var message = { [keys[i]]:messages[keys[i]] };
																Object.assign(output, message);
															}
														}
														io.to(clients[socket.request.session.username.toLowerCase()]).emit("fetch-conversation", { content:output, recipient:recipient_name, conversation_id:data.id, recipient_public_key:recipient_public_key });
													}
													else {
														io.to(clients[socket.request.session.username.toLowerCase()]).emit("fetch-conversation", { recipient:recipient_name, conversation_id:data.id, recipient_public_key:recipient_public_key });
													}
													// When the user fetches the content of a conversation, that conversation no longer contains an "unread" message.
													account["conversations"][data.id]["unread"] = false;
													if(!empty(account)) {
														fs.writeFile(account_file, JSON.stringify(account), function(error) {
															if(error) {
																console.log(error);
															}
														});
													}
												}
											});
										} 
										else {
											console.log(error);
										}
									});
								}
								else {
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("refresh");
								}
							}
							else {
								io.to(clients[socket.request.session.username.toLowerCase()]).emit("refresh");
							}
						}
						else {
							console.log("Empty account file.");
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		// Close a conversation and leave it using Socket.IO.
		socket.on("close-conversation", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.id)) {
				var hash = crypto.createHash("sha256").update(data.id).digest("base64");
				delete current_chats[socket.request.session.username.toLowerCase()];
				socket.leave(hash);
			}
		});
		// Create a conversation.
		socket.on("create-conversation", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.username)) {
				// The recipient's username.
				var recipient_username = data.username.toLowerCase();
				if(empty(data.title)) {
					var title = "Untitled Conversation";
				}
				else {
					var title = data.title.replace_all("<", "&lt;").replace_all(">", "&gt;");
				}
				// The user can't message themselves.
				if(recipient_username != socket.request.session.username.toLowerCase()) {
				// Read the sender's account file.
					fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
						if(!error) {
							if(!empty(json)) {
								// Generate a conversation ID.
								var id = generate_id();
								// The sender's account.
								var account = JSON.parse(json);
								// The sender's conversations.
								var conversations = account["conversations"];
								// If the ID already exists, then regenerate it.
								while(id in conversations || fs.existsSync(path.join(__dirname, "./data/conversations/" + id + ".txt"))) {
									var id = generate_id();
								}
								// The conversation file.
								var conversation_file = path.join(__dirname, "./data/conversations/" + id + ".txt");
								// The recipient's account file.
								var recipient_account_file = path.join(__dirname, "./data/accounts/" + recipient_username + ".txt");
								var recipient_settings_file = path.join(__dirname, "./data/settings/" + recipient_username + ".txt");
								var recipient_contacts_file = path.join(__dirname, "./data/contacts/" + recipient_username + ".txt");
								// If the recipient's account file exists, then read it.
								if(fs.existsSync(recipient_account_file) && fs.existsSync(recipient_settings_file)) {
									fs.readFile(recipient_settings_file, { encoding:"utf-8" }, function(error, json) {
										if(error) {
											console.log(error);
										}
										else {
											if(!empty(json)) {
												var settings = JSON.parse(json);
												if(settings["starting-conversations"] == "nobody") {
													io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"You cannot start a conversation with this user.", color:"rgb(120,120,250)", duration:4000 });
												}
												else {
													var whitelisted = false;
													if(settings["starting-conversations"] == "contacts") {
														fs.readFile(recipient_contacts_file, { encoding:"utf-8" }, function(error, json) {
															if(error) {
																console.log(error);
															}
															else {
																var contacts = JSON.parse(json);
																if(socket.request.session.username.toLowerCase() in contacts) {
																	whitelisted = true;
																}
																else {
																	io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"You cannot start a conversation with this user.", color:"rgb(120,120,250)", duration:4000 });
																}
															}
														});
													}
													if(whitelisted || settings["starting-conversations"] == "anybody") {
														fs.readFile(recipient_account_file, { encoding:"utf-8" }, function(error, json) {
															if(!empty(json)) {
																// The recipient's account.
																var recipient_account = JSON.parse(json);
																var recipient_name = recipient_account["username"];
																// The recipient's conversation object.
																var recipient_conversation = { [id]:{ "username":socket.request.session.username.toLowerCase(), "name":socket.request.session.username, "title":title, "visibility":true, "unread":false }};
																var recipient_merged = Object.assign(recipient_account["conversations"], recipient_conversation);
																// Add the conversation object to the recipient's account file.
																if(!empty(recipient_account)) {
																	fs.writeFile(recipient_account_file, JSON.stringify(recipient_account), function(error) {
																		if(error) {
																			console.log(error);
																		}
																		else {
																			var conversation = { [id]:{ "username":recipient_username, "name":recipient_name, "title":title, "visibility":true, "unread":false }};
																			var merged = Object.assign(account["conversations"], conversation);
																			// Create the conversation file.
																			fs.writeFile(conversation_file, "", function(error) {
																				if(error) {
																					console.log(error);
																				}
																				else {
																					// Add the conversation object to the sender's account file.
																					if(!empty(account)) {
																						fs.writeFile(account_file, JSON.stringify(account), function(error) {
																							if(error) {
																								console.log(error);
																							}
																							else {
																								// Output the sender's conversation list.
																								var list = account["conversations"];
																								io.to(clients[socket.request.session.username.toLowerCase()]).emit("list-conversations", { content:list, id:id });
																								io.to(clients[recipient_username]).emit("refetch");
																								io.to(clients[recipient_username]).emit("notify", { title:"New Conversation", text:socket.request.session.username + " started a conversation with you.", color:"message", duration:4000, args:{ id:id, type:"conversation" }});
																							}
																						});
																					}
																				}
																			});
																		}
																	});
																}
															}
														});
													}
												}
											}
										}
									});
								}
								else {
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Recipient not found.", color:"rgb(120,120,250)", duration:4000 });
								}
							}
						} 
						else {
							console.log(error);
						}
					});
				}
				else {
					io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"You can't message yourself.", color:"rgb(120,120,250)", duration:4000 });
				}
			}
		});
		// Process a new message.
		socket.on("new-message", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.text.sender) && !empty(data.text.recipient) && !empty(data.id)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.id + ".txt");
				if(!fs.existsSync(conversation_file)) {
					fs.writeFile(conversation_file, "", function(error) {
						if(error) {
							console.log(error);
						}
					});
				}
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							var recipient_username = account["conversations"][data.id]["username"];
							var recipient_account_file = path.join(__dirname, "./data/accounts/" + recipient_username + ".txt");
							var recipient_settings_file = path.join(__dirname, "./data/settings/" + recipient_username + ".txt");
							var recipient_contacts_file = path.join(__dirname, "./data/contacts/" + recipient_username + ".txt");
							if(fs.existsSync(recipient_account_file)) {
								fs.readFile(recipient_settings_file, { encoding:"utf-8" }, function(error, json) {
									if(error) {
										console.log(error);
									}
									else {
										if(!empty(json)) {
											var recipient_settings = JSON.parse(json);
											// If the recipient of the message has their privacy options set to allow anyone to message them.
											if(recipient_settings["starting-conversations"] == "anybody") {
												new_message();
											}
											// If only contacts can message them.
											else if(recipient_settings["starting-conversations"] == "contacts") {
												fs.readFile(recipient_contacts_file, { encoding:"utf-8" }, function(error, json) {
													if(error) {
														console.log(error);
													}
													else {
														if(!empty(json)) {
															var recipient_contacts = JSON.parse(json);
															if(socket.request.session.username.toLowerCase() in recipient_contacts) {
																new_message();
															}
															else {
																fs.readFile(recipient_account_file, { encoding:"utf-8" }, function(error, json) {
																	if(error) {
																		console.log(error);
																	}
																	else {
																		if(!empty(json)) {
																			var recipient_account = JSON.parse(json);
																			if(!empty(recipient_account["conversations"][data.id]) && recipient_account["conversations"][data.id]["visibility"] == true) {
																				new_message();
																			}
																			else {
																				io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"You can't message that user.", color:"rgb(120,120,250)", duration:4000 });
																			}
																		}
																	}
																});
															}
														}
													}
												});
											}
											// If nobody can message them.
											else {
												io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"You can't message that user.", color:"rgb(120,120,250)", duration:4000 });
											}
											function new_message() {
												// When a conversation is deleted by a user, it's only hidden from them, until the other user also deletes it, in which case it's deleted from the server. If only one of them has deleted it, sending a message in that conversation would "unhide" it from the user who deleted it. Past messages won't be visible though.
												if(!empty(account["conversations"][data.id])) {
													if(account["conversations"][data.id]["visibility"] != true) {
														account["conversations"][data.id]["visibility"] = true;
														if(!empty(account)) {
															fs.writeFile(account_file, JSON.stringify(account), function(error) {
																if(error) {
																	console.log(error);
																}
																else {
																	io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch");
																}
															});
														}
													}
													fs.readFile(conversation_file, { encoding:"utf-8" }, function(error, json) {
														if(!error) {
															var messages = new Object();
															if(!empty(json)) {
																var messages = JSON.parse(json);
															}
															var id = generate_id();
															while(id in messages) {
																var id = generate_id();
															}
															// Each message's content is repeated twice. It's encrypted once with the sender's public key, so that they can decrypt it for themselves (since they don't have access to the recipient's private key), and once again with the recipient's public key so that the recipient can decrypt it.
															var message = { [id]: { "from":socket.request.session.username, "text":{[socket.request.session.username.toLowerCase()]:data.text.sender, [recipient_username.toLowerCase()]:data.text.recipient}, "visibility":{ [socket.request.session.username.toLowerCase()]:true, [recipient_username]:true }}};
															Object.assign(messages, message);
															if(!empty(messages)) {
																fs.writeFile(conversation_file, JSON.stringify(messages), function(error) {
																	if(error) {
																		console.log(error);
																	}
																	else {
																		var file_info = fs.statSync(conversation_file);
																		var file_mtime = to_epoch(file_info.mtime);
																		io.to(current_chats[socket.request.session.username.toLowerCase()]).emit("new-message", { sender:data.text.sender, recipient:data.text.recipient, id:id, from:socket.request.session.username, conversation_id:data.id, conversation_modified:file_mtime });
																		io.to(clients[recipient_username.toLowerCase()]).emit("new-message", { sender:data.text.sender, recipient:data.text.recipient, id:id, from:socket.request.session.username, conversation_id:data.id, conversation_modified:file_mtime, relay:"true" });
																	}
																});
															}
															fs.readFile(recipient_account_file, { encoding:"utf-8" }, function(error, json) {
																if(error) {
																	console.log(error);
																}
																else {
																	if(!empty(json)) {
																		var recipient_account = JSON.parse(json);
																		if(recipient_account["conversations"][data.id]["visibility"] != true) {
																			recipient_account["conversations"][data.id]["visibility"] = true;
																			if(!empty(recipient_account)) {
																				fs.writeFile(recipient_account_file, JSON.stringify(recipient_account), function(error) {
																					if(error) {
																						console.log(error);
																					}
																					else {
																						io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch");
																						io.to(clients[recipient_username]).emit("refetch");
																						io.to(clients[recipient_username]).emit("notify", { title:"New Conversation", text:socket.request.session.username + " started a conversation with you.", color:"message", duration:4000, args:{ id:data.id }});
																					}
																				});
																			}
																		}
																	}
																}
															});
														} 
														else {
															console.log(error);
														}
													});
												}
											}
										}
									}
								});
							}
							else {
								io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Recipient not found.", color:"rgb(120,120,250)", duration:4000 });
							}
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		socket.on("delete-message", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.conversation) && !empty(data.message)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.conversation + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							if(!empty(account["conversations"][data.conversation]) && account["conversations"][data.conversation]["visibility"] == true) {
								fs.readFile(conversation_file, { encoding:"utf-8" }, function(error, json) {
									if(!error) {
										if(!empty(json)) {
											var messages = JSON.parse(json);
											messages[data.message]["visibility"][socket.request.session.username.toLowerCase()] = false;
											if(messages[data.message]["visibility"][socket.request.session.username.toLowerCase()] != true && messages[data.message]["visibility"][account["conversations"][data.conversation]["username"]] != true) {
												delete messages[data.message];
											}
											fs.writeFile(conversation_file, JSON.stringify(messages), function(error) {
												if(error) {
													console.log(error);
												}
												else {
													var file_info = fs.statSync(conversation_file);
													var file_mtime = to_epoch(file_info.mtime);
													io.to(clients[socket.request.session.username.toLowerCase()]).emit("delete-message", { id:data.message, conversation_id:data.conversation, conversation_modified:file_mtime });
												}
											});
										}
									}
								});
							}
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		socket.on("delete-conversation", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.id + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							if(!empty(account["conversations"][data.id])) {
								account["conversations"][data.id]["visibility"] = false;
								var recipient_username = account["conversations"][data.id]["username"];
								var recipient_account_file = path.join(__dirname, "./data/accounts/" + recipient_username + ".txt");
								fs.readFile(conversation_file, { encoding:"utf-8" }, function(error, json) {
									if(error) {
										console.log(error);
									}
									else {
										if(!empty(json)) {
											var messages = JSON.parse(json);
											var keys = Object.keys(messages);
											for(i = 0; i < keys.length; i++) {
												messages[keys[i]]["visibility"][socket.request.session.username.toLowerCase()] = false;
											}
											fs.writeFile(conversation_file, JSON.stringify(messages), function(error) {
												if(error) {
													console.log(error);
												}
											});
										}
									}
								});
								if(!empty(account)) {
									fs.writeFile(account_file, JSON.stringify(account), function(error) {
										if(error) {
											console.log(error);
										}
										else {
											io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch");
											fs.readFile(recipient_account_file, { encoding:"utf-8" }, function(error, json) {
												if(!empty(json)) {
													var recipient_account = JSON.parse(json);
													if(account["conversations"][data.id]["visibility"] != true && recipient_account["conversations"][data.id]["visibility"] != true) {
														fs.unlink(conversation_file, function(error) {
															if(error) {
																io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Couldn't delete conversation.", color:"rgb(120,120,250)", duration:4000 });
															}
															else {
																delete account["conversations"][data.id];
																delete recipient_account["conversations"][data.id];
																if(!empty(account)) {
																	fs.writeFile(account_file, JSON.stringify(account), function(error) {
																		if(error) {
																			console.log(error);
																		}
																	});
																}
																if(!empty(recipient_account)) {
																	fs.writeFile(recipient_account_file, JSON.stringify(recipient_account), function(error) {
																		if(error) {
																			console.log(error);
																		}
																	});
																}
															}
														});
													}
												}
											});
										}
									});
								}
							}
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		socket.on("unread-message", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(error) {
						console.log(error);
					}
					else {
						if(!empty(json)) {
							var account = JSON.parse(json);
							if(!empty(account["conversations"][data.id])) {
								account["conversations"][data.id]["unread"] = true;
								if(!empty(account)) {
									fs.writeFile(account_file, JSON.stringify(account), function(error) {
										if(error) {
											console.log(error);
										}
										else {
											io.to(clients[socket.request.session.username.toLowerCase()]).emit("unread-message", { conversation_id:data.id });
										}
									});
								}
							}
						}
					}
				});
			}
		});
		socket.on("rename-conversation", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.id)) {
				if(!empty(data.title)) {
					var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
					fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
						if(!error) {
							if(!empty(json)) {
								var account = JSON.parse(json);
								if(!empty(account["conversations"][data.id])) {
									var recipient_username = account["conversations"][data.id]["username"];
									var recipient_account_file = path.join(__dirname, "./data/accounts/" + recipient_username + ".txt");
									fs.readFile(recipient_account_file, { encoding:"utf-8" }, function(error, json) {
										if(!error) {
											if(!empty(json)) {
												var recipient_account = JSON.parse(json);
												var title = data.title.replace_all("<", "&lt;").replace_all(">", "&gt;");
												account["conversations"][data.id]["title"] = title;
												recipient_account["conversations"][data.id]["title"] = title;
												if(!empty(account)) {
													fs.writeFile(account_file, JSON.stringify(account), function(error) {
														if(error) {
															console.log(error);
														}
													});
												}
												if(!empty(recipient_account)) {
													fs.writeFile(recipient_account_file, JSON.stringify(recipient_account), function(error) {
														if(error) {
															console.log(error);
														}
													});
												}
											}
										}
									});
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch");
									io.to(clients[recipient_username]).emit("refetch");
								}
							}
						}
						else {
							console.log(error);
						}
					});
				}
				else {
					io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Title cannot be left blank.", color:"rgb(120,120,250)", duration:4000 });
				}
			}
			else {
				io.to(clients[socket.request.session.username.toLowerCase()]).emit("refresh");
			}
		});
		socket.on("fetch-conversation-info", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.id)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.id + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							var conversations = account["conversations"];
							if(!empty(account["conversations"][data.id])) {
								var id = data.id;
								var timestamp = id.substring(0, 10);
								var created = full_date(timestamp);
								var username = account["username"];
								var recipient_username = account["conversations"][data.id]["name"];
								var file_info = fs.statSync(conversation_file);
								var file_mtime = to_epoch(file_info.mtime);
								var file_size = file_info.size;
								var modified = full_date(file_mtime);
								io.to(clients[socket.request.session.username.toLowerCase()]).emit("fetch-conversation-info", { "username":username, "recipient_username":recipient_username, "id":id, "created":created, "modified":modified, "size":file_size });
							}
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		socket.on("fetch-message-info", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(!empty(data.conversation) && !empty(data.message)) {
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var conversation_file = path.join(__dirname, "./data/conversations/" + data.conversation + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							if(!empty(account["conversations"][data.conversation]) && account["conversations"][data.conversation]["visibility"] == true) {
								fs.readFile(conversation_file, { encoding:"utf-8" }, function(error, json) {
									if(!error) {
										if(!empty(json)) {
											var messages = JSON.parse(json);
											var message = messages[data.message];
											var id = data.message;
											var timestamp = id.substring(0, 10);
											var date = full_date(timestamp);
											var sender = message["from"];
											io.to(clients[socket.request.session.username.toLowerCase()]).emit("fetch-message-info", { conversation:data.conversation, message:data.message, date:date, sender:sender });
										}
									}
									else {
										console.log(error);
									}
								});
							}
						}
					}
					else {
						console.log(error);
					}
				});
			}
		});
		socket.on("save-settings", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			var settings_file = path.join(__dirname, "./data/settings/" + socket.request.session.username.toLowerCase() + ".txt");
			if(!empty(data)) {
				var settings = JSON.parse(data["settings"]);
				var config = data["settings"];
				if(settings["message-notification"] == "enabled" || settings["message-notification"] == "disabled") {
					if(settings["conversation-notification"] == "enabled" || settings["conversation-notification"] == "disabled") {
						if(settings["chat-scrolling"] == "enabled" || settings["chat-scrolling"] == "disabled") {
							if(settings["conversation-sorting"] == "title" || settings["conversation-sorting"] == "username" || settings["conversation-sorting"] == "newest" || settings["conversation-sorting"] == "oldest" || settings["conversation-sorting"] == "recently-messaged") {
								if(settings["interface"] == "light" || settings["interface"] == "dark") {
									fs.writeFile(settings_file, config, function(error) {
										if(error) {
											console.log(error);
										}
										else {
											io.to(clients[socket.request.session.username.toLowerCase()]).emit("save-settings", { settings: config });
										}
									});
								}
							}
						}
					}	
				}
			}
		});
		socket.on("reset-settings", function() {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			var settings_file = path.join(__dirname, "./data/settings/" + socket.request.session.username.toLowerCase() + ".txt");
			var settings = {"starting-conversations":"anybody", "message-notification":"enabled", "conversation-notification":"enabled", "chat-scrolling":"enabled", "conversation-sorting":"newest", "interface":"dark"};
			fs.writeFile(settings_file, JSON.stringify(settings), function(error) {
				if(error) {
					console.log(error);
				}
				else {
					io.to(clients[socket.request.session.username.toLowerCase()]).emit("reset-settings");
				}
			});
		});
		socket.on("change-password", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			if(data["new_password"] == data["repeat_password"]) {
				var new_password = data["new_password"];
				var account_file = path.join(__dirname, "./data/accounts/" + socket.request.session.username.toLowerCase() + ".txt");
				var username_hash = crypto.createHash("sha256").update(socket.request.session.username.toLowerCase()).digest("hex");
				var current_password_hash = crypto.createHash("sha512").update(data["current_password"]).digest("hex");
				var new_password_hash = crypto.createHash("sha512").update(new_password).digest("hex");
				var public_key_file = path.join(__dirname, "./data/keys/public/" + username_hash + ".txt");
				var private_key_file = path.join(__dirname, "./data/keys/private/" + username_hash + ".txt");
				fs.readFile(account_file, { encoding:"utf-8" }, function(error, json) {
					if(!error) {
						if(!empty(json)) {
							var account = JSON.parse(json);
							bcrypt.compare(data["current_password"], account["password"], function(error, valid) {
								if(valid) {
									bcrypt.hash(new_password, 10, function(error, hash) {
										if(error) {
											console.log(error);
										}
										else {
											account["password"] = hash;
											if(!empty(account)) {
												fs.writeFile(account_file, JSON.stringify(account), function(error) {
													if(error) {
														console.log(error);
													}
													else {
														fs.readFile(private_key_file, function(error, current_private_key_encrypted) {
															if(error) {
																console.log(error);
															}
															else {
																// The user's old password hash is used to decrypt their private key, and then re-encrypt it with their new password's hash. This allows them to still be able to read old conversations.
																var current_private_key = aes_decrypt(current_private_key_encrypted, current_password_hash);
																var new_private_key_encrypted = aes_encrypt(current_private_key, new_password_hash);
																fs.writeFile(private_key_file, new_private_key_encrypted, function(error) {
																	if(error) {
																		console.log(error);
																	}
																	else {
																		io.to(clients[socket.request.session.username.toLowerCase()]).emit("logout");
																	}
																});
															}
														});
													}
												});
											}
										}
									});
								}
								else {
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Invalid password.", color:"rgb(120,120,250)", duration:4000 });
								}
							});
						}
					}
					else {
						console.log(error);
					}
				});
			}
			else {
				io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Passwords don't match.", color:"rgb(120,120,250)", duration:4000 });
			}
		});
		socket.on("manage-contacts", function(data) {
			var client = { [socket.request.session.username.toLowerCase()]:socket.id };
			if(socket.request.session.username.toLowerCase() in clients) {
				clients[socket.request.session.username.toLowerCase()] = socket.id;
			}
			else {
				clients = Object.assign(clients, client);
			}
			var action = data["action"];
			var contacts_file = path.join(__dirname, "./data/contacts/" + socket.request.session.username.toLowerCase() + ".txt");
			if(!fs.existsSync(contacts_file)) {
				fs.writeFile(contacts_file, "", function(error) {
					if(error) {
						console.log(error);
					}
				});
			}
			fs.readFile(contacts_file, { encoding:"utf-8" }, function(error, json) {
				if(error) {
					console.log(error);
				}
				else {
					if(!empty(json)) {
						var contacts = JSON.parse(json);
					}
					else {
						var contacts = new Object();
					}
					if(action == "add-contact") {
						if(!empty(data["username"])) {
							var username = data["username"].toLowerCase();
							var account_file = path.join(__dirname, "./data/accounts/" + username + ".txt"); 
							if(fs.existsSync(account_file)) {
								var name = data["username"];
								var notes = data["notes"];
								if(empty(username)) {
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"No username entered.", color:"rgb(120,120,250)", duration:4000 });
								}
								else {
									var contact = { [username]:{ name:name, notes:notes }};
									Object.assign(contacts, contact);
									if(!empty(contacts)) {
										fs.writeFile(contacts_file, JSON.stringify(contacts), function(error) {
											if(error) {
												console.log(error);
											}
											else {
												io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch-contacts");
											}
										});
									}
								}
							}
							else {
								io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"User not found.", color:"rgb(120,120,250)", duration:4000 });
							}
						}
						else {
							io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Invalid username provided.", color:"rgb(120,120,250)", duration:4000 });
						}
					}
					else if(action == "delete-contact") {
						var username = data["username"].toLowerCase();
						if(empty(username)) {
							io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Invalid username provided.", color:"rgb(120,120,250)", duration:4000 });
						}
						else {
							delete contacts[username];
							fs.writeFile(contacts_file, JSON.stringify(contacts), function(error) {
								if(error) {
									console.log(error);
								}
								else {
									io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch-contacts");
								}
							});
						}
					}
					else if(action == "modify-contact") {
						var username = data["username"].toLowerCase();
						var notes = data["notes"];
						if(empty(username)) {
							io.to(clients[socket.request.session.username.toLowerCase()]).emit("notify", { title:"Error", text:"Invalid username provided.", color:"rgb(120,120,250)", duration:4000 });
						}
						else {
							contacts[username]["notes"] = notes;
							if(!empty(contacts)) {
								fs.writeFile(contacts_file, JSON.stringify(contacts), function(error) {
									if(error) {
										console.log(error);
									}
									else {
										io.to(clients[socket.request.session.username.toLowerCase()]).emit("refetch-contacts");
									}
								});
							}
						}
					}
					else if(action == "fetch-contacts") {
						fs.readFile(contacts_file, { encoding:"utf-8" }, function(error, json) {
							io.to(clients[socket.request.session.username.toLowerCase()]).emit("populate-contacts", { contacts:json });
						});
					}
				}
			});
		});
	}
	else if(empty(socket.request.session.username) && !socket.request.session.logged_in && socket.request.session.anonymous) {
		socket.on("logout", function(data) {
			if(!empty(data)) {
				var anonymous_id = data["anonymous_id"];
				delete anonymous_chats[anonymous_id];
				delete anonymous_clients[anonymous_id];
			}
		});
		socket.on("generate-anonymous-session", function() {
			crypto.generateKeyPair("rsa", {
				modulusLength:2048,
				publicKeyEncoding: {
					type:"spki",
					format:"pem"
				},
				privateKeyEncoding: {
					type:"pkcs8",
					format:"pem"
				}
			}, function(error, public_key, private_key) {
				if(error) {
					console.log(error);
				}
				else {
					// Two chats can't have the same ID.
					var conversation_id = generate_token();
					var conversation_id_hash = crypto.createHash("sha256").update(conversation_id).digest("hex");
					while(conversation_id in anonymous_chats || fs.existsSync(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"))) {
						conversation_id = generate_token();
						conversation_id_hash = crypto.createHash("sha256").update(conversation_id).digest("hex");
					}
					// Two users can't have the same ID.
					var anonymous_id = generate_token();
					while(anonymous_id in anonymous_clients) {
						anonymous_id = generate_token();
					}
					delete anonymous_chats[anonymous_id];
					if(conversation_id in anonymous_chats) {
						var anonymous_chat = {[anonymous_id]:{public_key:public_key}};
						Object.assign(anonymous_chats[conversation_id], anonymous_chat);
					}
					else {
						var anonymous_chat = {[conversation_id]:{[anonymous_id]:{public_key:public_key}}};
						Object.assign(anonymous_chats, anonymous_chat);
					}
					fs.writeFile(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), epoch(), function(error) {
						if(error) {
							console.log(error);
						}
						else {
							var anonymous_client = {[anonymous_id]:{socket_id:socket.id, conversations:{}}};
							Object.assign(anonymous_clients, anonymous_client);
							io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("generate-anonymous-session", { anonymous_id:anonymous_id, public_key:public_key, private_key:private_key, conversation_id:conversation_id });
						}
					});
				}
			});
		});
		socket.on("generate-credentials", function(data) {
			if(!empty(data)) {
				var conversation_id = data["conversation_id"];
				crypto.generateKeyPair("rsa", {
					modulusLength:2048,
					publicKeyEncoding: {
						type:"spki",
						format:"pem"
					},
					privateKeyEncoding: {
						type:"pkcs8",
						format:"pem"
					}
				}, function(error, public_key, private_key) {
					if(error) {
						console.log(error);
					}
					else {
						var anonymous_id = generate_token();
						while(anonymous_id in anonymous_clients) {
							anonymous_id = generate_token();
						}
						var anonymous_client = {[anonymous_id]:{socket_id:socket.id, conversations:{}}};
						Object.assign(anonymous_clients, anonymous_client);
						io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("generate-credentials", { anonymous_id:anonymous_id, public_key:public_key, private_key:private_key, conversation_id:conversation_id });
					}
				});
			}
		});
		socket.on("fetch-chat-members", function(data) {
			if(!empty(data)) {
				var conversation_id = data["conversation_id"];
				io.to(conversation_id).emit("fetch-chat-members", { members:anonymous_chats[conversation_id] });
			}
		});
		socket.on("new-anonymous-message", function(data) {
			if(data["anonymous_id"] in anonymous_clients) {
				anonymous_clients[data["anonymous_id"]["socket_id"]] = socket.id;
			}
			else {
				var anonymous_client = {[data["anonymous_id"]]:{socket_id:socket.id, conversations:{}}};
				Object.assign(anonymous_clients, anonymous_client);
			}
			var conversation_id = data["conversation_id"];
			var conversation_id_hash = crypto.createHash("sha256").update(conversation_id).digest("hex");
			if(fs.existsSync(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"))) {
				fs.readFile(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), { encoding:"utf-8" }, function(error, time) {
					if(error) {
						console.log(error);
					}
					else {
						if(epoch() - time >= 3600) {
							fs.unlink(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), function(error) {
								if(error) {
									console.log(error);
								}
								else {
									io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("notify", { title:"Error", text:"Conversation expired.", color:"rgb(120,120,250)", duration:4000 });
								}
							});
						}
						else {
							fs.writeFile(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), epoch(), function(error) {
								if(error) {
									console.log(error);
								}
								else {
									var id = generate_id();
									io.to(conversation_id).emit("new-anonymous-message", { id:id, anonymous_id:data["anonymous_id"], text:{ sender:data.text.sender, recipient:data.text.recipient }});
								}
							});
						}
					}
				});
			}
			else {
				io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("notify", { title:"Error", text:"Couldn't find conversation.", color:"rgb(120,120,250)", duration:4000 });
			}
		});
		socket.on("join-anonymous-chat", function(data) {
			if(data["anonymous_id"] in anonymous_clients) {
				anonymous_clients[data["anonymous_id"]["socket_id"]] = socket.id;
			}
			else {
				var anonymous_client = {[data["anonymous_id"]]:{socket_id:socket.id, conversations:{}}};
				Object.assign(anonymous_clients, anonymous_client);
			}
			if(!empty(data)) {
				var anonymous_id = data["anonymous_id"];
				var conversation_id = data["conversation_id"];
				var conversation_id_hash = crypto.createHash("sha256").update(conversation_id).digest("hex");
				var public_key = data["public_key"];
				if(fs.existsSync(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"))) {
					fs.readFile(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), { encoding:"utf-8" }, function(error, time) {
						if(error) {
							console.log(error);
						}
						else {
							if(epoch() - time >= 3600 || empty(time)) {
								fs.unlink(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), function(error) {
									if(error) {
										console.log(error);
									}
									else {
										io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("notify", { title:"Error", text:"Conversation expired.", color:"rgb(120,120,250)", duration:4000 });
										io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("logout");
									}
								});
							}
							else {
								fs.writeFile(path.join(__dirname, "./data/anonymous/" + conversation_id_hash + ".txt"), epoch(), function(error) {
									if(error) {
										console.log(error);
									}
									else {
										delete anonymous_chats[anonymous_id];
										if(conversation_id in anonymous_chats) {
											var anonymous_chat = {[anonymous_id]:{public_key:public_key}};
											Object.assign(anonymous_chats[conversation_id], anonymous_chat);
										}
										else {
											var anonymous_chat = {[conversation_id]:{[anonymous_id]:{public_key:public_key}}};
											Object.assign(anonymous_chats, anonymous_chat);
										}
										socket.join(conversation_id);
										io.to(conversation_id).emit("new-anonymous-user", {[anonymous_id]:{public_key:public_key}});
									}
								});
							}
						}
					});
				}
				else {
					io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("notify", { title:"Error", text:"Couldn't find conversation.", color:"rgb(120,120,250)", duration:4000 });
					io.to(anonymous_clients[anonymous_id]["socket_id"]).emit("logout");
				}
			}
		});
	}
	else {
		io.to(socket.id).emit("refresh");
	}
});

// Create required directories.
function directory_check() {
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
}
// AES encrypt.
function aes_encrypt(plaintext, password) {
	return crypto_js.AES.encrypt(plaintext, password);
}
// AES decrypt.
function aes_decrypt(encrypted, password) {
	var bytes  = crypto_js.AES.decrypt(encrypted.toString(), password);
	return bytes.toString(crypto_js.enc.Utf8);
}
// Get the key of a value in an object.
function get_key(object, value) {
	return Object.keys(object).find(key => object[key] === value);
}
// Generate a random integer.
function random_int(min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}
// Generate an ID.
function generate_id() {
	return epoch() + "-" + random_int(10000000, 99999999);
}
// Generate a token.
function generate_token() {
	var salt1 = bcrypt.genSaltSync();
	var salt2 = bcrypt.genSaltSync();
	return bcrypt.hashSync(salt1 + salt2, 10);
}
// Check if a string contains only letters and numbers.
function alphanumeric(string) {
	return string.match(/^[a-z0-9]+$/i);
}
// Convert a date to a timestamp.
function to_epoch(date){
	var date = Date.parse(date);
	return date / 1000;
}
// Convert a timestamp to a full date in a format like "3rd of January, 2019 at 3:45 PM".
function full_date(timestamp) {
	var date = new Date(timestamp * 1000);
	var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
	var year = date.getFullYear();
	var month = months[date.getMonth()];
	var day = date.getDate();
	var hour = date.getHours();
	var minute = "0" + date.getMinutes();
	var ampm = hour >= 12 ? "PM" : "AM";
	var hour = hour % 12;
	var hour = hour ? hour : 12; // Hour "0" would be "12".
	return day + nth(day) + " of " + month + ", " + year + " at " + hour + ":" + minute.substr(-2) + " " + ampm;
}
// Convert a timestamp to a date in the format DD / MM / YYYY.
function date(timestamp) {
	var date = new Date(timestamp * 1000);
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	var day = date.getDate();
	return day + "/" + month + "/" + year;
}
// Get the hour from a timestamp.
function hour(timestamp) {
	var date = new Date(timestamp * 1000);
	var hour = date.getHours();
	var minute = "0" + date.getMinutes();
	var ampm = hour >= 12 ? "PM" : "AM";
	var hour = hour % 12;
	var hour = hour ? hour : 12; // Hour "0" would be "12".
	return hour + ":" + minute.substr(-2) + " " + ampm;
}
// Get the current UNIX timestamp.
function epoch() {
	var date = new Date();
	var time = Math.round(date.getTime() / 1000);
	return time;
}
// Get the ordinal number suffix.
function nth(d) {
	if(d > 3 && d < 21) {
		return "th";
	}
	switch(d % 10) {
		case 1:  return "st";
		case 2:  return "nd";
		case 3:  return "rd";
		default: return "th";
	}
}
// Check if a string is empty.
function empty(text) {
	if(text != "" && text != null && typeof text != "undefined") {
		return false;	
	}
	return true;
}
// Replace all instances of a string.
String.prototype.replace_all = function(str1, str2, ignore) {
	return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
}

console.log("Server running - " + epoch());