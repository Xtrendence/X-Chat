document.addEventListener("DOMContentLoaded", function(e) {
	// Connect to Socket.IO.
	var socket = io.connect(window.location.href, { reconnection:true, reconnectionDelay:1000, reconnectionDelayMax:5000, reconnectionAttempts:99999 });
	var global_settings;
	initialize();
	// Socket.io functionality.
	socket.on("disconnect", function() {
		socket.connect();
	});
	// Populates the conversation list.
	socket.on("list-conversations", function(data) {
		// If there are no conversations, the start page is shown.
		if(empty(data["content"])) {
			show_start();
		}
		else {
			// Checks to see if a conversation is already open.
			if(document.getElementsByClassName("conversation-wrapper active").length > 0) {
				var active_id = document.getElementsByClassName("conversation-wrapper active")[0].id;
				var active_exists = true;
			}
			else {
				var active_exists = false;
			}
			var conversations = data.content;
			var keys = Object.keys(conversations);
			// Empties the conversation list.
			document.getElementsByClassName("conversation-list")[0].innerHTML = "";
			for(i = 0; i < keys.length; i++) {
				var id = keys[i];
				var username = conversations[keys[i]]["name"];
				var title = conversations[keys[i]]["title"];
				var time_created = id.substring(0, 10);
				var time_modified = conversations[keys[i]]["modified"];
				var unread = conversations[keys[i]]["unread"];
				if(unread) {
					var unread = "unread";
				}
				else {
					var unread = "";
				}
				// Every conversation file has a last modified time.
				if(empty(time_modified)) {
					socket.emit("list-conversations");
				}
				else {
					document.getElementsByClassName("conversation-list")[0].innerHTML += '<div class="conversation-wrapper noselect ' + unread + '" id="' + id + '" data-created="' + time_created + '" data-modified="' + time_modified + '"><div class="conversation-left"><button class="conversation-icon">' + acronym(username) + '</button></div><div class="conversation-right"><span class="conversation-username">' + username + '</span><span class="conversation-title">' + title + '</span></div><button class="conversation-unread-icon"></button></div>';
				}
			}
			if(active_exists) {
				document.getElementById(active_id).classList.add("active");
			}
			// If the user has a conversation open, then it's reopened once the conversation list is fetched.
			if(!empty(window.localStorage.getItem("active-conversation"))) {
				var active_id = window.localStorage.getItem("active-conversation");
				if(document.getElementById(active_id)) {
					document.getElementById(active_id).click();
				}
			}
			document.getElementsByClassName("start-overlay")[0].style.display = "none";
			document.getElementsByClassName("start-button")[0].style.display = "none";
			document.getElementsByClassName("start-wrapper")[0].style.display = "none";
			document.getElementsByClassName("navbar-item title")[0].style.display = "inline-block";
			document.getElementsByClassName("navbar-item compose")[0].style.display = "inline-block";
			sort_conversation_list();
			// Allows the server to pass a conversation ID to the client side script so that it'll be opened.
			if(!empty(data.id) && !empty(document.getElementById(data.id))) {
				document.getElementById(data.id).click();
			}
		}
	});
	// Handles the addition of new chat bubbles and messages.
	socket.on("new-message", function(data) {
		var list = document.getElementsByClassName("messages-list")[0];
		var username = document.getElementsByClassName("account-username")[0].textContent;
		// Every message has an ID. The ID is made up of the UNIX timestamp at the time the message was sent, and a random number. The first ten characters would always be said timestamp.
		var time = hour(data.id.substring(0, 10));
		var recipient_public_key = get_recipient_public_key();
		var public_key = get_public_key();
		var private_key = get_private_key();
		// Checks to make sure a conversation is actually open before adding bubbles.
		if(!empty(document.getElementsByClassName("conversation-wrapper active")) && document.getElementsByClassName("conversation-wrapper active")[0].id == data.conversation_id) {
			// The server can relay the message. The client side script checks to make sure it doesn't add duplicate bubbles.
			if(data.relay != "true") {
				// If the message was sent from the current user.
				if(data.from.toLowerCase() == username.toLowerCase()) {
					var from = "me";
					list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + data.id + '"><button class="chat-bubble-time">' + time + '</button><span>' + decrypt_text(data.sender, private_key) + '</span></div></div>';
				}
				// If the message was sent by the other party.
				else {
					var from = "others";
					list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + data.id + '"><span>' + decrypt_text(data.recipient, private_key) + '</span><button class="chat-bubble-time">' + time + '</button></div></div>';
				}
			}
			if(!empty(global_settings)) {
				if(JSON.parse(global_settings)["chat-scrolling"] == "enabled") {
					list.scrollTop = list.scrollHeight;
				}
			}
		}
		else {
			// If the message wasn't sent from the current user, and the message is a relay, then the current user is notified of the other person having messaged them.
			if(data.from.toLowerCase() != username.toLowerCase() && data.relay == "true") {
				if(!empty(global_settings)) {
					if(JSON.parse(global_settings)["message-notification"] == "enabled") {
						notify("New Message", data.from + " sent you a message.", "message", 4000, { id:data.conversation_id });
					}
				}
			}
		}
		// Updates the conversation's last modified time.
		if(!empty(data.conversation_id) && document.getElementById(data.conversation_id)) {
			document.getElementById(data.conversation_id).setAttribute("data-modified", data.conversation_modified);
			if(!document.getElementById(data.conversation_id).classList.contains("active")) {
				socket.emit("unread-message", { id:data.conversation_id });
			}
		}
		// If no last modified timestamp is found, then the conversations are refetched.
		else {
			socket.emit("list-conversations");
		}
		sort_conversation_list();
	});
	// The server can tell the client side script to remove a chat bubble element in case it has been deleted on the server-side.
	socket.on("delete-message", function(data) {
		document.getElementById(data.id).parentNode.remove();
		document.getElementById(data.conversation_id).setAttribute("data-modified", data.conversation_modified);
		sort_conversation_list();
	});
	// Mark a conversation as having an unread message.
	socket.on("unread-message", function(data) {
		if(!empty(data.conversation_id) && document.getElementById(data.conversation_id) && !document.getElementById(data.conversation_id).classList.contains("active")) {
			document.getElementById(data.conversation_id).classList.add("unread");
		}
	});
	// Fetch the content of a conversation.
	socket.on("fetch-conversation", function(data) {
		var list = document.getElementsByClassName("messages-list")[0];
		var username = document.getElementsByClassName("account-username")[0].textContent;
		var recipient = data.recipient;
		list.innerHTML = "";
		document.getElementsByClassName("chat-input-wrapper")[0].classList.add("active");
		document.getElementsByClassName("navbar-item more")[0].style.display = "inline-block";
		document.getElementsByClassName("loading-overlay")[0].style.display = "none";
		document.getElementsByClassName("navbar-item recipient")[0].style.display = "block";
		document.getElementsByClassName("navbar-item recipient")[0].textContent = recipient;
		// Mark the conversation as read.
		if(document.getElementById(data.conversation_id)) {
			document.getElementById(data.conversation_id).classList.remove("unread");
		}
		if(!empty(data)) {
			if(!empty(data.content)) {
				var messages = data.content;
				var keys = Object.keys(messages);
				var recipient_public_key = get_recipient_public_key();
				var public_key = get_public_key();
				var private_key = get_private_key();
				for(i = 0; i < keys.length; i++) {
					var time = hour(keys[i].substring(0, 10));
					if(messages[keys[i]]["from"] == username) {
						var from = "me";
						list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + keys[i] + '"><button class="chat-bubble-time">' + time + '</button><span>' + decrypt_text(messages[keys[i]]["text"][username.toLowerCase()], private_key) + '</span></div></div>';
					}
					else {
						var from = "others";
						list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + keys[i] + '"><button class="chat-bubble-time">' + time + '</button><span>' + decrypt_text(messages[keys[i]]["text"][username.toLowerCase()], private_key) + '</span></div></div>';
					}
				}
				list.scrollTop = list.scrollHeight;
			}
			// Save the recipient's public key in the browser's local storage.
			window.localStorage.setItem("recipient-public-key", data.recipient_public_key);
		}
		adjust_to_screen();
		close_messages_search();
	});
	// Fetch details about a specific conversation.
	socket.on("fetch-conversation-info", function(data) {
		open_popup(350, 400, "Information", '<span class="popup-label noselect">Username</span><span class="popup-text noselect">' + data.username + '</span><span class="popup-label noselect">Recipient</span><span class="popup-text noselect">' + data.recipient_username + '</span><span class="popup-label noselect">Conversation ID</span><span class="popup-text noselect">' + data.id + '</span><span class="popup-label noselect">Date Created</span><span class="popup-text noselect">' + data.created + '</span><span class="popup-label noselect">Date Modified</span><span class="popup-text noselect">' + data.modified + '</span><span class="popup-label noselect">File Size</span><span class="popup-text noselect">' + bytes_to_size(data.size) + '</span>');
	});
	// Fetch details about a specific message.
	socket.on("fetch-message-info", function(data) {
		open_popup(350, 340, "Information", '<span class="popup-label noselect">Conversation ID</span><span class="popup-text noselect">' + data.conversation + '</span><span class="popup-label noselect">Message ID</span><span class="popup-text noselect">' + data.message + '</span><span class="popup-label noselect">Date</span><span class="popup-text noselect">' + data.date + '</span><span class="popup-label noselect">Sender</span><span class="popup-text noselect">' + data.sender + '</span>');
	});
	// Refetch contacts.
	socket.on("refetch-contacts", function() {
		socket.emit("manage-contacts", { action:"fetch-contacts" });
		for(i = 0; i < document.getElementsByClassName("contact-card contact").length; i++) {
			document.getElementsByClassName("contact-card contact")[i].remove();
		}
		if(document.getElementsByClassName("contact-card edit").length > 0) {
			document.getElementsByClassName("contact-card edit")[0].remove();
		}
	});
	// Populates the contact list with contact cards.
	socket.on("populate-contacts", function(data) {
		document.getElementsByClassName("contacts-wrapper")[0].innerHTML = "";
		var add_card = document.createElement("div");
		add_card.setAttribute("class", "contact-card add");
		add_card.innerHTML = '<svg class="add-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>';
		document.getElementsByClassName("contacts-wrapper")[0].appendChild(add_card);
		add_card.addEventListener("click", function() {
			for(i = 0; i < document.getElementsByClassName("contact-overlay").length; i++) {
				document.getElementsByClassName("contact-overlay")[i].remove();
			}
			if(empty(document.getElementsByClassName("contact-card edit").length)) {
				var card = document.createElement("div");
				card.setAttribute("class", "contact-card edit");
				card.innerHTML = '<div class="contact-left"><button class="contact-icon"></button></div><div class="contact-right"><input class="contact-input username" type="text" placeholder="Username..."><input class="contact-input notes" type="text" placeholder="Notes..."></div><div class="contact-bottom"><svg class="close-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg><svg class="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"/></svg></div>';
				insert_after(card, document.getElementsByClassName("contact-card add")[0]);
				card.getElementsByClassName("contact-input username")[0].addEventListener("keyup", function() {
					if(!empty(this.value)) {
						var acronym = this.value.match(/\b(\w)/g).join("").toUpperCase();
					}
					else {
						var acronym = "";
					}
					card.getElementsByClassName("contact-icon")[0].textContent = acronym;
				});
				card.getElementsByClassName("close-icon")[0].addEventListener("click", function() {
					card.remove();
				});
				card.getElementsByClassName("check-icon")[0].addEventListener("click", function() {
					var username = card.getElementsByClassName("contact-input username")[0].value;
					var notes = card.getElementsByClassName("contact-input notes")[0].value;
					add_contact(username, notes);
				});
				card.getElementsByClassName("contact-input username")[0].addEventListener("keydown", function(e) {
					if(e.which == 13) {
						var username = card.getElementsByClassName("contact-input username")[0].value;
						var notes = card.getElementsByClassName("contact-input notes")[0].value;
						add_contact(username, notes);
					}
				});
				card.getElementsByClassName("contact-input notes")[0].addEventListener("keydown", function(e) {
					if(e.which == 13) {
						var username = card.getElementsByClassName("contact-input username")[0].value;
						var notes = card.getElementsByClassName("contact-input notes")[0].value;
						add_contact(username, notes);
					}
				});
			}
		});
		if(!empty(data["contacts"])) {
			var contacts = JSON.parse(data["contacts"]);
			var usernames = Object.keys(contacts).reverse();
			for(i = 0; i < usernames.length; i++) {
				if(empty(document.getElementById("card-" + usernames[i]))) {
					var card = document.createElement("div");
					var notes = contacts[usernames[i]]["notes"];
					if(empty(notes)) {
						notes = "-";
					}
					card.setAttribute("class", "contact-card contact");
					card.setAttribute("id", "card-" + usernames[i]);
					card.setAttribute("data-name", contacts[usernames[i]]["name"]);
					card.setAttribute("data-notes", notes);
					card.innerHTML = '<div class="contact-left"><button class="contact-icon">' + acronym(contacts[usernames[i]]["name"]) + '</button></div><div class="contact-right"><span class="contact-username">' + contacts[usernames[i]]["name"] + '</span><span class="contact-notes">' + notes + '</span></div>';
					document.getElementsByClassName("contacts-wrapper")[0].appendChild(card);
					document.getElementById("card-" + usernames[i]).addEventListener("click", function() {
						if(document.getElementsByClassName("contact-overlay").length > 0) {
							document.getElementsByClassName("contact-overlay")[0].remove();
						}
						if(document.getElementsByClassName("contact-card edit").length > 0) {
							document.getElementsByClassName("contact-card edit")[0].remove();
						}
						var overlay = document.createElement("div");
						overlay.setAttribute("class", "contact-overlay");
						overlay.setAttribute("id", "overlay-" + this.getAttribute("id").substring(5));
						overlay.setAttribute("data-name", this.getAttribute("data-name"));
						overlay.setAttribute("data-notes", this.getAttribute("data-notes"));
						overlay.innerHTML = '<button data-action="back">Back</button><button data-action="delete">Delete</button><button data-action="edit">Edit</button>';
						this.appendChild(overlay);
						for(j = 0; j < overlay.getElementsByTagName("button").length; j++) {
							overlay.getElementsByTagName("button")[j].addEventListener("click", function() {
								var button = this;
								var action = this.getAttribute("data-action");
								if(action == "back") {
									setTimeout(function() {
										document.getElementById("overlay-" + button.parentNode.getAttribute("id").substring(8)).remove();
									}, 25);
								}
								else if(action == "delete") {
									open_popup(200, 140, "Delete Contact", '<span class="popup-label noselect">Are you sure?</span><button class="popup-submit" id="action-delete-contact" data-username="' + button.parentNode.getAttribute("id").substring(8) + '">Delete</button>');
								}
								else if(action == "edit") {
									open_popup(240, 190, "Edit Contact", '<span class="popup-label noselect">Notes for "' + button.parentNode.getAttribute("data-name") + '".</span><input type="text" class="popup-input notes" placeholder="Notes..." value="' + button.parentNode.getAttribute("data-notes").replace("-", "") + '"><button class="popup-submit" id="action-modify-contact" data-username="' + button.parentNode.getAttribute("id").substring(8) + '">Confirm</button>');
								}
							});
						}
					});
				}
			}
		}
	});
	// Save and apply settings.
	socket.on("save-settings", function(data) {
		apply_settings(data["settings"]);
	});
	// Refetch conversation list.
	socket.on("refetch", function() {
		socket.emit("list-conversations");
	});
	// Logout.
	socket.on("logout", function() {
		logout();
	});
	// Fetch settings after they've been reset.
	socket.on("reset-settings", function() {
		fetch_settings();
	});
	// Refresh the page.
	socket.on("refresh", function() {
		location.reload();
	});
	// The server can send notifications to the client.
	socket.on("notify", function(data) {
		var enabled = true;
		if(!empty(data.args)) {
			if(!empty(global_settings)) {
				var settings = JSON.parse(global_settings);
				if(data.args.type == "conversation" && settings["conversation-notification"] != "enabled") {
					enabled = false;
				}
				else if(data.args.type == "message" && settings["message-notification"] != "enabled") {
					enabled = false;
				}
			}
		}
		if(enabled) {
			notify(data.title, data.text, data.color, data.duration, data.args);
		}
	});
	// Start overlay functionality.
	document.getElementsByClassName("start-overlay")[0].addEventListener("click", function() {
		document.getElementsByClassName("start-wrapper")[0].style.display = "none";
		if(document.getElementsByClassName("navbar-item compose")[0].style.display == "inline-block") {
			document.getElementsByClassName("start-overlay")[0].style.display = "none";
			document.getElementsByClassName("start-button")[0].style.display = "none";
		}
		else {
			document.getElementsByClassName("start-button")[0].style.display = "block";
		}
	});
	document.getElementsByClassName("start-button")[0].addEventListener("click", function() {
		document.getElementsByClassName("start-button")[0].style.display = "none";
		document.getElementsByClassName("start-wrapper")[0].style.display = "block";
		document.getElementsByClassName("start-input username")[0].value = "";
		document.getElementsByClassName("start-input title")[0].value = "";
	});
	document.getElementsByClassName("start-submit")[0].addEventListener("click", function() {
		var username = document.getElementsByClassName("start-input username")[0].value;
		var title = document.getElementsByClassName("start-input title")[0].value;
		create_conversation(username, title);
	});
	document.getElementsByClassName("start-anonymous")[0].addEventListener("click", function() {
		window.location.href = "./anonymous";
	});
	// Navbar functionality.
	document.getElementsByClassName("navbar")[0].addEventListener("click", function() {
		if(document.getElementsByClassName("more-menu")[0].style.display == "block") {
			close_popup();
		}
	});
	document.getElementsByClassName("navbar-item more")[0].addEventListener("click", function() {
		setTimeout(function() {
			close_popup();
			document.getElementsByClassName("popup-overlay")[0].style.display = "block";
			document.getElementsByClassName("more-menu")[0].style.display = "block";
			document.getElementsByClassName("more-arrow")[0].style.display = "block";
		}, 10);
	});
	document.getElementsByClassName("navbar-item settings")[0].addEventListener("click", function() {
		show_settings();
	});
	document.getElementsByClassName("navbar-item compose")[0].addEventListener("click", function() {
		close_popup();
		show_compose();
	});
	// More menu functionality.
	for(i = 0; i < document.getElementsByClassName("more-block").length; i++) {
		document.getElementsByClassName("more-block")[i].addEventListener("click", function() {
			close_popup();
			if(this.classList.contains("delete")) {
				open_popup(200, 140, "Delete Conversation", '<span class="popup-label noselect">Are you sure?</span><button class="popup-submit" id="action-delete-conversation">Delete</button>');
			}
			else if(this.classList.contains("info")) {
				var id = document.getElementsByClassName("conversation-wrapper active")[0].id;
				socket.emit("fetch-conversation-info", { id:id });
			}
			else if(this.classList.contains("rename")) {
				open_popup(240, 140, "Rename Conversation", '<input type="text" class="popup-input title" placeholder="New Title..."><button class="popup-submit" id="action-rename-conversation">Rename</button>');
			}
			else if(this.classList.contains("search")) {
				show_messages_search();
			}
			else if(this.classList.contains("close")) {
				close_conversation();
			}
			else if(this.classList.contains("export")) {
				open_popup(350, 300, "Export Conversation", '<span class="popup-label noselect">After clicking export, a popup window will open containing your conversation. Save this page\'s content to have an offline copy of your conversation.</span><button class="popup-submit" id="action-export-conversation">Export</button>');
			}
		});
	}
	// Conversation list functionality.
	document.getElementsByClassName("conversation-list")[0].addEventListener("click", function(e) {
		if(e.target && e.target.classList.contains("conversation-wrapper")) {
			close_conversation();
			var conversations = document.getElementsByClassName("conversation-wrapper");
			var id = e.target.id;
			for(i = 0; i < conversations.length; i++) {
				conversations[i].classList.remove("active");
			}
			e.target.classList.add("active");
			window.localStorage.setItem("active-conversation", id);
			socket.emit("fetch-conversation", { id:id });
			document.getElementsByClassName("loading-overlay")[0].style.display = "block";
		}
	});
	// Conversation list context menu functionality.
	document.getElementsByClassName("conversation-list")[0].addEventListener("contextmenu", function(e) {
		e.preventDefault();
		if(e.target && e.target.classList.contains("conversation-wrapper")) {
			var id = e.target.id;
			document.getElementById(id).click();
		}
	});
	// Message list functionality.
	document.getElementsByClassName("messages-list")[0].addEventListener("scroll", function() {
		close_popup();
	});
	document.getElementsByClassName("messages-list")[0].addEventListener("contextmenu", function(e) {
		e.preventDefault();
		if(e.target && e.target.classList.contains("chat-bubble")) {
			var id = e.target.id;
			document.getElementById(id).click();
		}
	});
	// Clicking a chat bubble opens a menu allowing the user to perform a number of actions on that specific message.
	document.getElementsByClassName("messages-list")[0].addEventListener("click", function(e) {
		if(e.target && e.target.classList.contains("chat-bubble")) {
			var bubbles = document.getElementsByClassName("chat-bubble");
			var bubble_arrow = document.getElementsByClassName("bubble-arrow")[0];
			var bubble_menu = document.getElementsByClassName("bubble-menu")[0];
			
			bubble_arrow.style.display = "block";
			bubble_menu.style.display = "block";
			
			var bubble_menu_width = bubble_menu.offsetWidth;
			var bubble_menu_height = bubble_menu.offsetHeight;
			var id = e.target.id;
			for(i = 0; i < bubbles.length; i++) {
				bubbles[i].classList.remove("active");
			}
			e.target.classList.add("active");
			var stats = e.target.getBoundingClientRect();
			var top = stats.y;
			var bottom = stats.y + stats.height + 5;
			var left = stats.x + 5;
			var right = stats.x + stats.width;
			
			bubble_arrow.style.top = "auto";
			bubble_arrow.style.right = "auto";
			bubble_arrow.style.bottom = "auto";
			bubble_arrow.style.left = "auto";
			bubble_arrow.style.transform = "rotate(0deg)";
			bubble_menu.style.top = "auto";
			bubble_menu.style.right = "auto";
			bubble_menu.style.bottom = "auto";
			bubble_menu.style.left = "auto";
			
			if(bottom + bubble_menu_height + 100 > window.innerHeight) {
				bubble_arrow.style.transform = "rotate(180deg)";
				bubble_arrow.style.top = top - 20 + "px";
				bubble_menu.style.top = top - bubble_menu_height - 18 + "px";
			}
			else {
				bubble_arrow.style.top = bottom + "px";
				bubble_menu.style.top = bottom + 14 + "px";
			}
			
			if(e.target.parentNode.classList.contains("me")) {
				bubble_arrow.style.left = left + (stats.width / 2) - 20 + "px";
				bubble_menu.style.left = left - bubble_menu_width + (stats.width / 2) + 25 + "px";
			}
			else if(e.target.parentNode.classList.contains("others")) {
				bubble_arrow.style.left = left + (stats.width / 2) - 20 + "px";
				bubble_menu.style.left = left + (stats.width / 2) - 30 + "px";
			}
			
		}
	});
	// Bubble menu functionality.
	for(i = 0; i < document.getElementsByClassName("bubble-block").length; i++) {
		document.getElementsByClassName("bubble-block")[i].addEventListener("click", function() {
			var conversation = document.getElementsByClassName("conversation-wrapper active")[0].id;
			var message = document.getElementsByClassName("chat-bubble active")[0].id;
			close_popup();
			if(this.classList.contains("copy")) {
				copy_to_clipboard(document.getElementById(message).getElementsByTagName("span")[0].textContent);
				notify("Copied", "Text copied to clipboard.", "rgb(120,120,250)", 4000);
			}
			else if(this.classList.contains("delete")) {
				open_popup(200, 140, "Delete Message", '<span class="popup-label noselect">Are you sure?</span><button class="popup-submit" id="action-delete-message" data-conversation="' + conversation + '" data-message="' + message + '">Delete</button>');
			}
			else if(this.classList.contains("info")) {
				socket.emit("fetch-message-info", { conversation:conversation, message:message });
			}
		});
	}
	// To make sure a cached version of the JS file isn't loaded.
	document.getElementsByClassName("js-file")[0].setAttribute("src", "./assets/js/main.js?" + epoch());
	// Pressing enter to send message.
	document.getElementsByClassName("chat-input-field")[0].addEventListener("keydown", function(e) {
		if(e.which == 13) {
			document.getElementsByClassName("chat-input-submit")[0].click();
		}
	});
	// Clicking the send button.
	document.getElementsByClassName("chat-input-button")[0].addEventListener("click", function(e) {
		document.getElementsByClassName("chat-input-submit")[0].click();
		document.getElementsByClassName("chat-input-field")[0].focus();
	});
	// Message sending functionality.
	document.getElementsByClassName("chat-input-submit")[0].addEventListener("click", function() {
		var id = document.getElementsByClassName("conversation-wrapper active")[0].id;
		var input = document.getElementsByClassName("chat-input-field")[0];
		var text = input.value.trim();
		if(!empty(text)) {
			send_message(id, text);
			input.value = "";
		}
	});
	// Search messages functionality.
	document.getElementsByClassName("search-input")[0].addEventListener("keyup", function() {
		var query = document.getElementsByClassName("search-input")[0].value.toLowerCase();
		var messages = document.getElementsByClassName("chat-bubble");
		for(i = 0; i < messages.length; i++) {
			var text = messages[i].getElementsByTagName("span")[0].textContent;
			if(text.toLowerCase().indexOf(query) > -1) {
				messages[i].parentNode.style.display = "block";
			} 
			else {
				messages[i].parentNode.style.display = "none";
			}
		}
	});
	document.getElementsByClassName("search close-icon")[0].addEventListener("click", function() {
		close_messages_search();
	});
	// Settings functionality.
	document.getElementsByClassName("settings-close")[0].addEventListener("click", function() {
		close_settings();
	});
	for(i = 0; i < document.getElementsByClassName("settings-block").length; i++) {
		document.getElementsByClassName("settings-block")[i].addEventListener("click", function() {
			close_settings_panes();
			document.getElementsByClassName("settings-blocks")[0].style.display = "none";
			if(this.classList.contains("account")) {
				document.getElementsByClassName("settings-pane account")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Account";
			}
			else if(this.classList.contains("privacy")) {
				document.getElementsByClassName("settings-pane privacy")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Privacy";
			}
			else if(this.classList.contains("contacts")) {
				document.getElementsByClassName("settings-pane contacts")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Contacts";
				socket.emit("manage-contacts", { action:"fetch-contacts" });
			}
			else if(this.classList.contains("notifications")) {
				document.getElementsByClassName("settings-pane notifications")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Notifications";
			}
			else if(this.classList.contains("behavior")) {
				document.getElementsByClassName("settings-pane behavior")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Behavior";
			}
			else if(this.classList.contains("appearance")) {
				document.getElementsByClassName("settings-pane appearance")[0].style.display = "inline-block";
				document.getElementsByClassName("settings-title")[0].textContent = "Settings - Appearance";
			}
			document.getElementsByClassName("settings-panes")[0].style.display = "block";
		});
	}
	document.getElementsByClassName("settings-panes")[0].getElementsByClassName("back-icon")[0].addEventListener("click", function() {
		close_settings_panes();
	});
	for(i = 0; i < document.getElementsByClassName("settings-submit").length; i++) {
		document.getElementsByClassName("settings-submit")[i].addEventListener("click", function() {
			var action = this.getAttribute("data-action");
			if(action == "logout") {
				logout();
			}
			else if(action == "reset-settings") {
				socket.emit("reset-settings");
			}
			else if(action == "change-password") {
				var current_password = document.getElementsByClassName("settings-input current-password")[0].value;
				var new_password = document.getElementsByClassName("settings-input new-password")[0].value;
				var repeat_password = document.getElementsByClassName("settings-input repeat-password")[0].value;
				if(new_password != repeat_password) {
					notify("Error", "Passwords don't match.", "rgb(120,120,250)", 4000);
				}
				else {
					socket.emit("change-password", { current_password:current_password, new_password:new_password, repeat_password:repeat_password });
				}
			}
		});
	}
	for(i = 0; i < document.getElementsByClassName("settings-choice").length; i++) {
		document.getElementsByClassName("settings-choice")[i].addEventListener("click", function() {
			var settings = JSON.parse(document.getElementsByClassName("settings-bottom")[0].getAttribute("data-settings"));
			var setting = this.parentNode.getAttribute("data-setting");
			var choice = this.getAttribute("data-choice");
			settings[setting] = choice;
			save_settings(JSON.stringify(settings));
		});
	}
	// Focus on the input field when any key is pressed.
	document.addEventListener("keydown", function(e) {
		if(empty(window.getSelection().toString()) && document.getElementsByClassName("chat-input-wrapper")[0].classList.contains("active") && !document.activeElement.classList.contains("search-input") && document.getElementsByClassName("settings-wrapper")[0].style.display != "block" && document.getElementsByClassName("start-wrapper")[0].style.display != "block") {
			document.getElementsByClassName("chat-input-field")[0].focus();
			if(document.getElementsByClassName("more-menu")[0].style.display == "block" || document.getElementsByClassName("bubble-menu")[0].style.display == "block") {
				close_popup();
			}
		}
		// Enter key.
		if(e.which == 13) {
			if(document.getElementsByClassName("start-wrapper")[0].style.display == "block") {
				document.getElementsByClassName("start-submit")[0].click();
			}
			else if(document.getElementsByClassName("popup-wrapper")[0].style.display == "block") {
				document.getElementsByClassName("popup-submit")[0].click();
			}
		}
		// Escape key.
		if(e.which == 27) {
			if(document.getElementsByClassName("conversation-wrapper active").length > 0) {
				close_conversation();
			}
		}
		// Up arrow key.
		if(e.which == 38) {
			if(document.getElementsByClassName("conversation-wrapper active").length > 0 && document.activeElement !== document.getElementsByClassName("chat-input-field")[0]) {
				if(document.getElementsByClassName("conversation-wrapper active")[0] != document.getElementsByClassName("conversation-list")[0].firstChild) {
					document.getElementsByClassName("conversation-wrapper active")[0].previousSibling.click();
				}
			}
		}
		// Down arrow key.
		if(e.which == 40) {
			if(document.getElementsByClassName("conversation-wrapper active").length > 0 && document.activeElement !== document.getElementsByClassName("chat-input-field")[0]) {
				if(document.getElementsByClassName("conversation-wrapper active")[0] != document.getElementsByClassName("conversation-list")[0].lastChild) {
					document.getElementsByClassName("conversation-wrapper active")[0].nextSibling.click();
				}
			}
		}
	});
	// Document click functionality.
	document.addEventListener("click", function(e) {
		if(!e.target.classList.contains("bubble-block") && !e.target.classList.contains("chat-bubble") && document.getElementsByClassName("bubble-menu")[0].style.display == "block") {
			close_popup();
		}
	});
	// Window visibility functionality.
	var window_hidden;
	var window_visibility_change; 
	if(typeof document.hidden !== "undefined") { 
		hidden = "hidden";
		window_visibility_change = "visibilitychange";
	} 
	else if(typeof document.webkitHidden !== "undefined") {
		hidden = "webkitHidden";
		window_visibility_change = "webkitvisibilitychange";
	}
	document.addEventListener(window_visibility_change, function() {
		socket.connect();
		socket.emit("list-conversations");
	}, false);
	// Window resize functionality.
	window.addEventListener("resize", adjust_to_screen);
	// Logout.
	function logout() {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState == XMLHttpRequest.DONE) {
				location.reload();
			}
		}
		xhr.open("POST", "/logout", true);
		xhr.send();
	}
	// Sort conversation list.
	function sort_conversation_list() {
		var list = document.getElementsByClassName("conversation-list")[0];
		var conversations = document.getElementsByClassName("conversation-wrapper");
		if(!empty(global_settings)) {
			var settings = JSON.parse(global_settings);
			if(settings["conversation-sorting"] == "title") {
				var array = [].slice.call(conversations).sort(function(a, b) {
					if(a.getElementsByClassName("conversation-title")[0].textContent > b.getElementsByClassName("conversation-title")[0].textContent) {
						return 1;
					}
					else {
						return -1;
					}
				});
			}
			else if(settings["conversation-sorting"] == "username") {
				var array = [].slice.call(conversations).sort(function(a, b) {
					if(a.getElementsByClassName("conversation-username")[0].textContent > b.getElementsByClassName("conversation-username")[0].textContent) {
						return 1;
					}
					else {
						return -1;
					}
				});
			}
			else if(settings["conversation-sorting"] == "newest") {
				var array = [].slice.call(conversations).sort(function(a, b) {
					if(a.getAttribute("data-created") > b.getAttribute("data-created")) {
						return 1;
					}
					else {
						return -1;
					}
				});
				array.reverse();
			}
			else if(settings["conversation-sorting"] == "oldest") {
				var array = [].slice.call(conversations).sort(function(a, b) {
					if(a.getAttribute("data-created") > b.getAttribute("data-created")) {
						return 1;
					}
					else {
						return -1;
					}
				});
			}
			else if(settings["conversation-sorting"] == "recently-messaged") {
				var array = [].slice.call(conversations).sort(function(a, b) {
					if(a.getAttribute("data-modified") > b.getAttribute("data-modified")) {
						return 1;
					}
					else {
						return -1;
					}
				});
				array.reverse();
			}
			if(!empty(array)) {
				array.forEach(function(conversation) {
					list.appendChild(conversation);
				});
			}
		}
	}
	// Create a conversation.
	function create_conversation(username, title) {
		socket.emit("create-conversation", { username:username, title:title });
		close_popup();
	}
	// Encrypt text.
	function encrypt_text(plaintext, key) {
		var jsencrypt = new JSEncrypt();
		jsencrypt.setKey(key);
		return jsencrypt.encrypt(plaintext);
	}
	// Decrypt text.
	function decrypt_text(encrypted, key) {
		var jsencrypt = new JSEncrypt();
		jsencrypt.setKey(key);
		return jsencrypt.decrypt(encrypted);
	}
	// Send a message.
	function send_message(id, text) {
		var sender_public_key = get_public_key();
		var sender_encrypted = encrypt_text(text, sender_public_key);
		var recipient_public_key = get_recipient_public_key();
		var recipient_encrypted = encrypt_text(text, recipient_public_key);
		socket.emit("new-message", { id:id, text:{ sender:sender_encrypted, recipient:recipient_encrypted }});
		close_messages_search();
	}
	// Delete a message.
	function delete_message(conversation, message) {
		socket.emit("delete-message", { conversation:conversation, message:message });
	}
	// Delete conversation.
	function delete_conversation(id) {
		socket.emit("delete-conversation", { id:id });
		close_conversation();
		document.getElementById(id).remove();
		if(empty(document.getElementsByClassName("conversation-list")[0].innerHTML)) {
			show_start();
		}
	}
	// Rename conversation.
	function rename_conversation(id, title) {
		socket.emit("rename-conversation", { id:id, title:title });
	}
	// Close conversation.
	function close_conversation() {
		if(document.getElementsByClassName("conversation-wrapper active").length > 0) {
			var id = document.getElementsByClassName("conversation-wrapper active")[0].id;
		}
		document.getElementsByClassName("navbar-item recipient")[0].style.display = "none";
		document.getElementsByClassName("navbar-item recipient")[0].textContent = "";
		document.getElementsByClassName("loading-overlay")[0].style.display = "none";
		document.getElementsByClassName("navbar-item more")[0].style.display = "none";
		document.getElementsByClassName("chat-input-wrapper")[0].classList.remove("active");
		document.getElementsByClassName("messages-list")[0].innerHTML = "";
		var conversations = document.getElementsByClassName("conversation-wrapper");
		for(i = 0; i < conversations.length; i++) {
			conversations[i].classList.remove("active");
		}
		adjust_to_screen();
		if(document.getElementsByClassName("conversation-wrapper active").length > 0) {
			socket.emit("close-conversation", { id:id });
		}
		close_messages_search();
		window.localStorage.removeItem("active-conversation");
		window.localStorage.removeItem("recipient-public-key");
	}
	// Show start page.
	function show_start() {
		document.getElementsByClassName("conversation-list")[0].innerHTML = "";
		document.getElementsByClassName("start-overlay")[0].style.display = "block";
		document.getElementsByClassName("start-button")[0].style.display = "block";
		document.getElementsByClassName("start-wrapper")[0].style.display = "none";
		document.getElementsByClassName("navbar-item title")[0].style.display = "none";
		document.getElementsByClassName("navbar-item compose")[0].style.display = "none";
		document.getElementsByClassName("chat-input-wrapper")[0].classList.remove("active");
	}
	// Show compose.
	function show_compose() {
		document.getElementsByClassName("start-overlay")[0].style.display = "block";
		document.getElementsByClassName("start-button")[0].style.display = "none";
		document.getElementsByClassName("start-wrapper")[0].style.display = "block";
		document.getElementsByClassName("start-input username")[0].value = "";
		document.getElementsByClassName("start-input title")[0].value = "";
	}
	// Close compose.
	function close_compose() {
		document.getElementsByClassName("start-overlay")[0].style.display = "none";
		document.getElementsByClassName("start-button")[0].style.display = "none";
		document.getElementsByClassName("start-wrapper")[0].style.display = "none";
	}
	// Show messages search.
	function show_messages_search() {
		close_messages_search();
		document.getElementsByClassName("search-bar")[0].style.display = "block";
		document.getElementsByClassName("search-input")[0].focus();
		document.getElementsByClassName("messages-list")[0].style.height = "calc(100% - 60px - 50px - 40px)";
		document.getElementsByClassName("messages-list")[0].style.top = "90px";
	}
	// Close messages search.
	function close_messages_search() {
		document.getElementsByClassName("search-bar")[0].style.display = "none";
		document.getElementsByClassName("search-input")[0].blur();
		document.getElementsByClassName("messages-list")[0].style.height = "calc(100% - 60px - 50px)";
		document.getElementsByClassName("messages-list")[0].style.top = "50px";
		var messages = document.getElementsByClassName("chat-bubble");
		for(i = 0; i < messages.length; i++) {
			messages[i].parentNode.style.display = "block";
		}
	}
	// Fetch current settings.
	function fetch_settings() {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState == XMLHttpRequest.DONE) {
				document.getElementsByClassName("settings-bottom")[0].setAttribute("data-settings", xhr.responseText);
				apply_settings(xhr.responseText);
			}
		}
		xhr.open("POST", "/settings", true);
		xhr.send();
	}
	// Save settings.
	function save_settings(config) {
		if(!empty(config)) {
			socket.emit("save-settings", { settings: config });
		}
	}
	// Apply settings.
	function apply_settings(config) {
		global_settings = config;
		if(!empty(config)) {
			var settings = JSON.parse(config);
			var choice_buttons = document.getElementsByClassName("settings-choice");
			for(i = 0; i < choice_buttons.length; i++) {
				choice_buttons[i].classList.remove("active");
			}
			for(i = 0; i < choice_buttons.length; i++) {
				var choice_setting = choice_buttons[i].parentNode.getAttribute("data-setting");
				if(settings[choice_setting] == choice_buttons[i].getAttribute("data-choice")) {
					choice_buttons[i].classList.add("active");
				}
			}
			document.getElementsByClassName("settings-bottom")[0].setAttribute("data-settings", config);
			if(settings["interface"] == "light") {
				if(document.getElementsByClassName("theme-css")[0].getAttribute("data-color") == "dark") {
					document.getElementsByClassName("theme-css")[0].setAttribute("href", "./assets/css/main-light.css");
					document.getElementsByClassName("theme-css")[0].setAttribute("data-color", "light");
					window.localStorage.setItem("theme", "light");
				}
			}
			else if(settings["interface"] == "dark") {
				if(document.getElementsByClassName("theme-css")[0].getAttribute("data-color") == "light") {
					document.getElementsByClassName("theme-css")[0].setAttribute("href", "./assets/css/main-dark.css");
					document.getElementsByClassName("theme-css")[0].setAttribute("data-color", "dark");
					window.localStorage.setItem("theme", "dark");
				}
			}
			sort_conversation_list();
		}
	}
	// Show settings.
	function show_settings() {
		if(document.getElementsByClassName("start-wrapper")[0].style.display == "block") {
			close_compose();
		}
		setTimeout(function() {
			document.getElementsByClassName("popup-overlay")[0].style.display = "block";
			document.getElementsByClassName("settings-wrapper")[0].style.display = "block";
		}, 10);
		close_settings_panes();
		fetch_settings();
		document.getElementsByClassName("settings-title")[0].textContent = "Settings - " + document.getElementsByClassName("account-username")[0].textContent;
	}
	// Close settings.
	function close_settings() {
		document.getElementsByClassName("popup-overlay")[0].style.display = "none";
		document.getElementsByClassName("settings-wrapper")[0].style.display = "none";
	}
	// Close settings panes.
	function close_settings_panes() {
		var panes = document.getElementsByClassName("settings-pane");
		for(i = 0; i < panes.length; i++) {
			document.getElementsByClassName("settings-pane")[i].scrollTop = 0;
			document.getElementsByClassName("settings-pane")[i].style.display = "none";
		}
		document.getElementsByClassName("settings-panes")[0].style.display = "none";
		document.getElementsByClassName("settings-blocks")[0].style.display = "block";
		document.getElementsByClassName("settings-title")[0].textContent = "Settings - " + document.getElementsByClassName("account-username")[0].textContent;
	}
	// Contact functions.
	function add_contact(username, notes) {
		socket.emit("manage-contacts", { action:"add-contact", username:username, notes:notes });
	}
	function delete_contact(username) {
		socket.emit("manage-contacts", { action:"delete-contact", username:username });
	}
	function modify_contact(username, notes) {
		socket.emit("manage-contacts", { action:"modify-contact", username:username, notes:notes });
	}
	// Adjust to screen size.
	function adjust_to_screen() {
		close_popup();
		var width = window.innerWidth;
		var height = window.innerHeight;
		if(width <= 680) {
			if(document.getElementsByClassName("chat-input-wrapper")[0].classList.contains("active")) {
				document.getElementsByClassName("conversation-list")[0].style.display = "none";
				document.getElementsByClassName("messages-list")[0].style.display = "block";
				document.getElementsByClassName("navbar-item chats")[0].style.display = "none";
				document.getElementsByClassName("navbar-item recipient")[0].style.display = "block";
			}
			else {
				document.getElementsByClassName("conversation-list")[0].style.display = "block";
				document.getElementsByClassName("messages-list")[0].style.display = "none";
				document.getElementsByClassName("navbar-item chats")[0].style.display = "inline-block";
				document.getElementsByClassName("navbar-item recipient")[0].style.display = "none";
			}
		}
		else {
			document.getElementsByClassName("conversation-list")[0].style.display = "block";
			document.getElementsByClassName("messages-list")[0].style.display = "block";
			document.getElementsByClassName("navbar-item chats")[0].style.display = "block";
			if(document.getElementsByClassName("chat-input-wrapper")[0].classList.contains("active")) {
				document.getElementsByClassName("navbar-item recipient")[0].style.display = "block";
			}
			else {
				document.getElementsByClassName("navbar-item recipient")[0].style.display = "none";
			}
		}
		document.getElementsByClassName("messages-list")[0].scrollTop = document.getElementsByClassName("messages-list")[0].scrollHeight;
	}
	// Check if a string or variable is empty.
	function empty(text) {
		if(text != null && text != "" && typeof text != "undefined" && JSON.stringify(text) != "{}") {
			return false;
		}
		return true;
	}
	// Insert element after another.
	function insert_after(new_node, reference_node) {
		reference_node.parentNode.insertBefore(new_node, reference_node.nextSibling);
	}
	// Copy text to clipboard.
	function copy_to_clipboard(text) {
		var temp = document.createElement("textarea");
		temp.classList.add("select");
		document.getElementsByClassName("hidden-area")[0].appendChild(temp);
		temp.textContent = text;
		temp.select();
		document.execCommand("copy");
		temp.remove();
	}
	// Encrypt text using AES-256.
	function aes_encrypt(plaintext, password) {
		let encrypted = CryptoJS.AES.encrypt(plaintext, password);
		delete encrypted.key;
		return encrypted;
	}
	// Decrypt text using AES-256.
	function aes_decrypt(encrypted, password) {
		var bytes  = CryptoJS.AES.decrypt(encrypted.toString(), password);
		return bytes.toString(CryptoJS.enc.Utf8);
	}
	// Get recipient public key.
	function get_recipient_public_key() {
		return window.localStorage.getItem("recipient-public-key");
	}
	// Get public key.
	function get_public_key() {
		return window.localStorage.getItem("public-key");
	}
	// Get private key.
	function get_private_key() {
		return aes_decrypt(localStorage.getItem("private-key"), localStorage.getItem("password-hash"));
	}
	// Turn text into an acronym.
	function acronym(text) {
		return text.match(/\b(\w)/g).join("").toUpperCase();
	}
	// Convert date into UNIX timestamp.
	function to_epoch(date){
		var date = Date.parse(date);
		return date / 1000;
	}
	// Return full date with hours and minutes.
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
	// Return date.
	function date(timestamp) {
		var date = new Date(timestamp * 1000);
		var year = date.getFullYear();
		var month = date.getMonth() + 1;
		var day = date.getDate();
		return day + "/" + month + "/" + year;
	}
	// Return time.
	function hour(timestamp) {
		var date = new Date(timestamp * 1000);
		var hour = date.getHours();
		var minute = "0" + date.getMinutes();
		var ampm = hour >= 12 ? "PM" : "AM";
		var hour = hour % 12;
		var hour = hour ? hour : 12; // Hour "0" would be "12".
		return hour + ":" + minute.substr(-2) + " " + ampm;
	}
	// Return current UNIX timestamp.
	function epoch() {
		var date = new Date();
		var time = Math.round(date.getTime() / 1000);
		return time;
	}
	// Return st, nd, rd or th.
	function nth(d) {
		if(d > 3 && d < 21) {
			return 'th';
		}
		switch(d % 10) {
			case 1:  return "st";
			case 2:  return "nd";
			case 3:  return "rd";
			default: return "th";
		}
	}
	// Generate random integer.
	function random_int(min, max) {
		return Math.floor(Math.random() * (max - min) + min);
	}
	// Convert bytes to human-readable size.
	function bytes_to_size(bytes) {
		var sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		if(bytes == 0) {
			return "0 Bytes";
		}
		var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
		return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
	}
	// Initialize.
	function initialize() {
		if(local_storage_available()) {
			window.localStorage.removeItem("recipient-public-key");
			if(empty(window.localStorage.getItem("public-key")) || empty(window.localStorage.getItem("private-key"))) {
				logout();
			}
			else {
				socket.emit("list-conversations");
				if(detect_mobile()) {
					document.getElementsByTagName("body")[0].setAttribute("id", "mobile");
				}
				else {
					document.getElementsByTagName("body")[0].setAttribute("id", "desktop");
				}
				fetch_settings();
			}
		}
		else {
			document.body.innerHTML = '<div class="error-overlay noselect"></div><div class="error-wrapper" style="width:300px;height:180px;left:calc(50% - 150px);top:calc(50% - 90px);"><div class="error-top"><span class="error-title">Error - Local Storage Required</span></div><div class="error-bottom"><span class="error-text">Your browser needs to support Local Storage.</span><a href="./"><button class="error-button">Refresh</button></a></div></div>';
		}
	}
	// Check if localStorage is available.
	function local_storage_available() {
		try {
			window.localStorage.setItem("test", "test");
			window.localStorage.removeItem("test");
			return true;
		} 
		catch(e) {
			return false;
		}
	}
	// Detect if the user is on a mobile browser.
	function detect_mobile() {
		var check = false;
		(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
		return check;
	};
	// Popup functionality.
	// Define variables.
	var popup_overlay = document.getElementsByClassName("popup-overlay")[0];
	var popup_wrapper = document.getElementsByClassName("popup-wrapper")[0];
	var popup_title = document.getElementsByClassName("popup-title")[0];
	var popup_close = document.getElementsByClassName("popup-close")[0];
	var popup_bottom = document.getElementsByClassName("popup-bottom")[0];
	// Close popup when the user clicks on the overlay.
	popup_overlay.addEventListener("click", function() {
		close_popup();
	});
	// Close popup when the user clicks on the close button.
	popup_close.addEventListener("click", function() {
		close_popup();
	});
	// Perform an action when the user clicks on the popup's submit button.
	document.getElementsByClassName("popup-wrapper")[0].addEventListener('click',function(e) {
		if(e.target && e.target.classList.contains("popup-submit")) {
			if(e.target.id == "action-delete-conversation") {
				var id = document.getElementsByClassName("conversation-wrapper active")[0].id;
				delete_conversation(id);
			}
			else if(e.target.id == "action-rename-conversation") {
				var id = document.getElementsByClassName("conversation-wrapper active")[0].id;
				var title = document.getElementsByClassName("popup-input title")[0].value;
				rename_conversation(id, title);
			}
			else if(e.target.id == "action-export-conversation") {
				var name = document.getElementsByClassName("conversation-wrapper active")[0].getElementsByClassName("conversation-username")[0].textContent;
				var title = document.getElementsByClassName("conversation-wrapper active")[0].getElementsByClassName("conversation-title")[0].textContent;
				var head = '<head><meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no"><link rel="apple-touch-icon" sizes="57x57" href="./assets/img/favicon/apple-icon-57x57.png"><link rel="apple-touch-icon" sizes="60x60" href="./assets/img/favicon/apple-icon-60x60.png"><link rel="apple-touch-icon" sizes="72x72" href="./assets/img/favicon/apple-icon-72x72.png"><link rel="apple-touch-icon" sizes="76x76" href="./assets/img/favicon/apple-icon-76x76.png"><link rel="apple-touch-icon" sizes="114x114" href="./assets/img/favicon/apple-icon-114x114.png"><link rel="apple-touch-icon" sizes="120x120" href="./assets/img/favicon/apple-icon-120x120.png"><link rel="apple-touch-icon" sizes="144x144" href="./assets/img/favicon/apple-icon-144x144.png"><link rel="apple-touch-icon" sizes="152x152" href="./assets/img/favicon/apple-icon-152x152.png"><link rel="apple-touch-icon" sizes="180x180" href="./assets/img/favicon/apple-icon-180x180.png"><link rel="icon" type="image/png" sizes="192x192"  href="./assets/img/favicon/android-icon-192x192.png"><link rel="icon" type="image/png" sizes="32x32" href="./assets/img/favicon/favicon-32x32.png"><link rel="icon" type="image/png" sizes="96x96" href="./assets/img/favicon/favicon-96x96.png"><link rel="icon" type="image/png" sizes="16x16" href="./assets/img/favicon/favicon-16x16.png"><link rel="manifest" href="./assets/img/favicon/manifest.json"><meta name="msapplication-TileColor" content="#141414"><meta name="msapplication-TileImage" content="/ms-icon-144x144.png"><meta name="theme-color" content="#141414"><link class="theme-css" data-color="dark" rel="stylesheet" href="./assets/css/dark.css"><link rel="stylesheet" href="./assets/css/resize.css"><title>' + name + ' - ' + title + '</title></head>';
				var current_conversation = document.getElementsByClassName("messages-list")[0].innerHTML;
				var export_html = '<html>' + head + '<body><div class="messages-list" style="display:block;top:0;left:0;height:100%;width:100%;">' + current_conversation + '</div></body></html>';
				var export_window = window.open("", "_blank");
				export_window.document.write(export_html);
			}
			else if(e.target.id == "action-delete-message") {
				var conversation = e.target.getAttribute("data-conversation");
				var message = e.target.getAttribute("data-message");
				delete_message(conversation, message);
			}
			else if(e.target.id == "action-delete-contact") {
				var username = e.target.getAttribute("data-username");
				socket.emit("manage-contacts", { action:"delete-contact", username:username });
			}
			else if(e.target.id == "action-modify-contact") {
				var username = e.target.getAttribute("data-username");
				var notes = document.getElementsByClassName("popup-input notes")[0].value;
				socket.emit("manage-contacts", { action:"modify-contact", username:username, notes:notes });
			}
			else if(e.target.id == "action-logout") {
				logout();
			}
			close_popup();
		}
	});
	// Open a popup window.
	function open_popup(width, height, title, html) {
		close_popup();
		popup_overlay.style.display = "block";
		popup_wrapper.style.display = "block";
		popup_wrapper.style.width = width + "px";
		popup_wrapper.style.height = height + "px";
		popup_wrapper.style.left = "calc(50% - " + width / 2 + "px)";
		popup_wrapper.style.top = "calc(50% - " + height / 2 + "px)";
		popup_bottom.style.height = height - 30 + "px";
		popup_title.textContent = title;
		popup_bottom.innerHTML = html;
	}
	// Close the popup window.
	function close_popup() {
		popup_overlay.style.display = "none";
		if(popup_wrapper.style.display == "block") {
			popup_wrapper.style.display = "none";
		}
		if(document.getElementsByClassName("settings-wrapper")[0].style.display == "block") {
			close_settings();
		}
		if(document.getElementsByClassName("bubble-menu")[0].style.display == "block") {
			document.getElementsByClassName("bubble-menu")[0].style.display = "none";
			document.getElementsByClassName("bubble-arrow")[0].style.display = "none";
			var bubbles = document.getElementsByClassName("chat-bubble");
			for(i = 0; i < bubbles.length; i++) {
				bubbles[i].classList.remove("active");
			}
		}
		if(document.getElementsByClassName("more-menu")[0].style.display == "block") {
			document.getElementsByClassName("more-menu")[0].style.display = "none";
			document.getElementsByClassName("more-arrow")[0].style.display = "none";
		}
	}
	// Notification function.
	function notify(title, description, color, duration, data) {
		var build = document.createElement("div");
		if(color == "message") {
			build.setAttribute("class", "notification-wrapper message noselect");
			build.innerHTML = '<div class="notification-message-top"><span class="notification-message-title">' + title + '</span></div><div class="notification-message-bottom"><span class="notification-message-description">' + description + '</span></div>';
			build.addEventListener("click", function() {
				close_popup();
				close_settings();
				close_compose();
				document.getElementById(data.id).click();
			});
		}
		else {
			build.setAttribute("class", "notification-wrapper noselect");
			build.innerHTML = '<div class="notification-title-wrapper"><span class="notification-title">' + title + '</span></div><div class="notification-description-wrapper"><span class="notification-description">' + description + '</span></div>';
			build.style.background = color;
		}
		document.getElementsByClassName("notification-area")[0].style.display = "block"
		document.getElementsByClassName("notification-area")[0].appendChild(build);
		build.style.display = "block";
		build.style.left = "0px";
		setTimeout(function() {
			build.style.left = "-600px";
			setTimeout(function() {
				build.remove();
				if(document.getElementsByClassName("notification-area")[0].innerHTML == "") {
					document.getElementsByClassName("notification-area")[0].style.display = "none";
				}
			}, 400);
		}, duration);
	}
});