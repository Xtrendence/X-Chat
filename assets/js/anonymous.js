document.addEventListener("DOMContentLoaded", function(e) {
	// Connect to Socket.IO.
	var socket = io.connect(window.location.href.replace("/anonymous", ""), { reconnection:true, reconnectionDelay:1000, reconnectionDelayMax:5000, reconnectionAttempts:99999 });
	initialize();
	// Socket.io functionality.
	socket.on("disconnect", function() {
		socket.emit("fetch-chat-members");
		socket.connect();
	});
	// Generate an anonymous chat session. Saves the user's anonymous ID, public key, and private key in the browser's local storage, and then redirects them to their newly generated chat session.
	socket.on("generate-anonymous-session", function(data) {
		if(!empty(data)) {
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-id", data["anonymous_id"]);
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-public-key", data["public_key"]);
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-private-key", data["private_key"]);
			window.location.href = "./anonymous?conversation=" + data["conversation_id"];
		}
		else {
			socket.emit("generate-anonymous-session");
		}
	});
	// Generates credentials (anonymous ID, public key, and private key). This is used when a user joins an existing chat.
	socket.on("generate-credentials", function(data) {
		if(!empty(data)) {
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-id", data["anonymous_id"]);
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-public-key", data["public_key"]);
			window.localStorage.setItem(data["conversation_id"] + "-anonymous-private-key", data["private_key"]);
			socket.emit("join-anonymous-chat", { anonymous_id:get_anonymous_id(), conversation_id:get_conversation_id(), public_key:get_public_key() });
		}
		else {
			socket.emit("generate-anonymous-session");
		}
	});
	// Fetch and store chat members in local storage.
	socket.on("fetch-chat-members", function(data) {
		if(Object.keys(data.members).length >= 2) {
			document.getElementsByClassName("loading-overlay")[0].style.display = "none";
		}
		else {
			document.getElementsByClassName("loading-overlay")[0].getElementsByTagName("span")[0].textContent = "Waiting for another user to join using your URL...";
		}
		update_credentials();
	});
	// Every time a user joins a chat, their details are added 
	socket.on("new-anonymous-user", function(data) {
		if(!empty(data)) {
			if(!empty(get_chat_members())) {
				var members = JSON.parse(get_chat_members());
			}
			else {
				var members = new Object();
			}
			Object.assign(members, data);
			window.localStorage.setItem(get_conversation_id() + "-anonymous-members", JSON.stringify(members));
			if(Object.keys(data)[0] != get_anonymous_id()) {
				window.localStorage.setItem(get_conversation_id() + "-anonymous-recipient-id", Object.keys(data)[0]);
				window.localStorage.setItem(get_conversation_id() + "-anonymous-recipient-public-key", data[Object.keys(data)[0]]["public_key"]);
			}
		}
		socket.emit("fetch-chat-members", { conversation_id:get_conversation_id() });
	});
	// Adding new message bubbles.
	socket.on("new-anonymous-message", function(data) {
		var list = document.getElementsByClassName("messages-list")[0];
		var time = hour(data.id.substring(0, 10));
		var recipient_public_key = get_recipient_public_key();
		var public_key = get_public_key();
		var private_key = get_private_key();
		if(data.anonymous_id == get_anonymous_id()) {
			var from = "me";
			list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + data.id + '"><button class="chat-bubble-time">' + time + '</button><span>' + decrypt_text(data.text.sender, private_key) + '</span></div></div>';
		}
		else {
			var from = "others";
			list.innerHTML += '<div class="chat-bubble-wrapper ' + from + ' noselect"><div class="chat-bubble" id="' + data.id + '"><span>' + decrypt_text(data.text.recipient, private_key) + '</span><button class="chat-bubble-time">' + time + '</button></div></div>';
		}
		list.scrollTop = list.scrollHeight;
	});
	// Logging out.
	socket.on("logout", function() {
		logout();
	});
	// Allowing the server to send notifications to the user.
	socket.on("notify", function(data) {
		notify(data.title, data.text, data.color, data.duration, data.args);
	});
	document.getElementsByClassName("chat-input-button")[0].addEventListener("click", function() {
		var text = document.getElementsByClassName("chat-input-field")[0].value;
		if(!empty(text)) {
			send_message(text);
		}
		document.getElementsByClassName("chat-input-field")[0].value = "";
	});
	document.getElementsByClassName("chat-input-field")[0].addEventListener("keydown", function(e) {
		if(e.which == 13) {
			document.getElementsByClassName("chat-input-button")[0].click();
		}
	});
	document.getElementsByClassName("logout-icon")[0].addEventListener("click", function() {
		logout();
	});
	document.getElementsByClassName("incognito-icon")[0].addEventListener("click", function() {
		if(document.getElementsByClassName("privacy-wrapper")[0].style.display == "block") {
			document.getElementsByClassName("privacy-wrapper")[0].style.display = "none";
		}
		else {
			document.getElementsByClassName("privacy-wrapper")[0].style.display = "block";
		}
	});
	document.getElementsByClassName("close-icon")[0].addEventListener("click", function() {
		document.getElementsByClassName("privacy-wrapper")[0].style.display = "none";
	});
	document.addEventListener("keydown", function(e) {
		if(document.getElementsByClassName("loading-overlay")[0].style.display != "block" && document.getElementsByClassName("privacy-wrapper")[0].style.display != "block") {
			document.getElementsByClassName("chat-input-field")[0].focus();
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
		socket.emit("fetch-chat-members");
	}, false);
	setInterval(function() {
		socket.emit("fetch-chat-members");
	}, 30000);
	// Update credentials on the privacy page.
	function update_credentials() {
		var privacy_wrapper = document.getElementsByClassName("privacy-wrapper")[0];
		var me_section = document.getElementsByClassName("privacy-section me")[0];
		var others_section = document.getElementsByClassName("privacy-section others")[0];

		me_section.getElementsByClassName("privacy-text anonymous-id")[0].textContent = "My Anonymous ID\n\n" + get_anonymous_id();
		me_section.getElementsByClassName("privacy-text public-key")[0].textContent = "My Public Key\n\n" + get_public_key();
		me_section.getElementsByClassName("privacy-text private-key")[0].textContent = "My Private Key\n\n" + get_private_key();

		others_section.getElementsByClassName("privacy-text anonymous-id")[0].textContent = "Their Anonymous ID\n\n" + get_recipient_anonymous_id();
		others_section.getElementsByClassName("privacy-text public-key")[0].textContent = "Their Public Key\n\n" + get_recipient_public_key();

		privacy_wrapper.getElementsByClassName("privacy-text conversation-id")[0].textContent = "Conversation ID - " + get_conversation_id();

		
			var chat_members = get_chat_members();
		if(!empty(get_chat_members())) {
			var members = JSON.parse(chat_members);
			var anonymous_ids = Object.keys(members);
			privacy_wrapper.getElementsByClassName("privacy-text chat-members")[0].textContent = "Chat Members\n\n";
			for(i = 0; i < anonymous_ids.length; i++) {
				privacy_wrapper.getElementsByClassName("privacy-text chat-members")[0].textContent += "Anonymous ID\n\n" + anonymous_ids[i] + "\n\nPublic Key\n\n" + members[anonymous_ids[i]]["public_key"] + "\n\n";
			}
		}
	}
	// Logout.
	function logout() {
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-id");
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-public-key");
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-private-key");
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-members");
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-recipient-id");
		window.localStorage.removeItem(get_conversation_id() + "-anonymous-recipient-public-key");
		socket.emit("logout", { anonymous_id:get_anonymous_id() });
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState == XMLHttpRequest.DONE) {
				window.location.href = "./";
			}
		}
		xhr.open("POST", "/logout", true);
		xhr.send();
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
	function send_message(text) {
		var sender_public_key = get_public_key();
		var sender_encrypted = encrypt_text(text, sender_public_key);
		var recipient_public_key = get_recipient_public_key();
		var recipient_encrypted = encrypt_text(text, recipient_public_key);
		socket.emit("new-anonymous-message", { conversation_id:get_conversation_id(), anonymous_id:get_anonymous_id(), text:{ sender:sender_encrypted, recipient:recipient_encrypted }});
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
	// Get chat members.
	function get_chat_members() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-members");
	}
	// Get recipient's anonymous ID.
	function get_recipient_anonymous_id() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-recipient-id");
	}
	// Get anonymous ID.
	function get_anonymous_id() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-id");
	}
	// Get conversation ID.
	function get_conversation_id() {
		return get_url_query("conversation");
	}
	// Get recipient public key.
	function get_recipient_public_key() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-recipient-public-key");
	}
	// Get public key.
	function get_public_key() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-public-key");
	}
	// Get private key.
	function get_private_key() {
		return window.localStorage.getItem(get_conversation_id() + "-anonymous-private-key");
	}
	// Turn text into an acronym.
	function acronym(text) {
		return text.match(/\b(\w)/g).join("").toUpperCase();
	}
	// Get URL query by key.
	function get_url_query(key) {  
		return decodeURIComponent(window.location.search.replace(new RegExp("^(?:.*[&\\?]" + encodeURIComponent(key).replace(/[\.\+\*]/g, "\\$&") + "(?:\\=([^&]*))?)?.*$", "i"), "$1"));  
	}  
	// Convert date into UNIX timestamp.
	function to_epoch(date){
		var date = Date.parse(date);
		return date / 1000;
	}
	// Check if a string or variable is empty.
	function empty(text) {
		if(text != null && text != "" && typeof text != "undefined" && JSON.stringify(text) != "{}") {
			return false;
		}
		return true;
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
	function initialize() {
		if(local_storage_available()) {
			if(detect_mobile()) {
				document.getElementsByTagName("body")[0].setAttribute("id", "mobile");
			}
			else {
				document.getElementsByTagName("body")[0].setAttribute("id", "desktop");
			}
			if(empty(get_conversation_id())) {
				socket.emit("generate-anonymous-session");
			}
			else {
				if(empty(get_anonymous_id()) || empty(get_public_key())) {
					socket.emit("generate-credentials", { conversation_id:get_conversation_id() });
				}
				else {
					socket.emit("join-anonymous-chat", { anonymous_id:get_anonymous_id(), conversation_id:get_conversation_id(), public_key:get_public_key() });
				}
			}
			var theme = window.localStorage.getItem("theme");
			if(!empty(theme)) {
				if(document.getElementsByClassName("theme-css")[0].getAttribute("data-color") == "dark") {
					if(theme == "light") {
						document.getElementsByClassName("theme-css")[0].setAttribute("href", "./assets/css/anonymous-light.css");
						document.getElementsByClassName("theme-css")[0].setAttribute("data-color", "light");
					}
				}
			}
		}
		else {
			document.body.innerHTML = '<div class="error-overlay noselect"></div><div class="error-wrapper" style="width:300px;height:180px;left:calc(50% - 150px);top:calc(50% - 90px);"><div class="error-top"><span class="error-title">Error - Local Storage Required</span></div><div class="error-bottom"><span class="error-text">Your browser needs to support Local Storage.</span><a href="./"><button class="error-button">Refresh</button></a></div></div>';
		}
	}
	function detect_mobile() {
		var check = false;
		(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
		return check;
	}
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
		if(title.toLowerCase() == "error" && document.getElementsByClassName("loading-overlay")[0].style.display == "block") {
			document.getElementsByClassName("loading-overlay")[0].getElementsByTagName("span")[0].textContent = description;
		}
	}
});
	