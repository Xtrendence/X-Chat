document.addEventListener("DOMContentLoaded", function(e) {
	initialize();
	var login_text = document.getElementsByClassName("login-text")[0];
	var login_border = document.getElementsByClassName("login-border")[0];
	var login_wrapper = document.getElementsByClassName("login-wrapper")[0];
	var login_button = document.getElementsByClassName("login-button")[0];
	var login_switch = document.getElementsByClassName("login-switch")[0];
	var register_switch = document.getElementsByClassName("register-switch")[0];
	var register_border = document.getElementsByClassName("register-border")[0];
	var register_wrapper = document.getElementsByClassName("register-wrapper")[0];
	var register_button = document.getElementsByClassName("register-button")[0];
	var anonymous_button = document.getElementsByClassName("login-anonymous")[0];
	
	login_button.addEventListener("click", function() {
		var username = document.getElementsByClassName("login-input username")[0].value;
		var password = document.getElementsByClassName("login-input password")[0].value;
		if(!empty(username) && !empty(password)) {
			login(username, password);
		}
		else {
			login_text.style.display = "block";
			login_text.textContent = "Fill out both fields.";
		}
	});
	// Switch to login.
	login_switch.addEventListener("click", function() {
		document.getElementsByClassName("login-input username")[0].value = document.getElementsByClassName("register-input username")[0].value;
		document.getElementsByClassName("login-input password")[0].value = document.getElementsByClassName("register-input password")[0].value;
		login_border.style.display = "block";
		login_wrapper.style.display = "block";
		register_border.style.display = "none";
		register_wrapper.style.display = "none";
	});
	// Switch to register.
	register_switch.addEventListener("click", function() {
		document.getElementsByClassName("register-input username")[0].value = document.getElementsByClassName("login-input username")[0].value;
		document.getElementsByClassName("register-input password")[0].value = document.getElementsByClassName("login-input password")[0].value;
		login_border.style.display = "none";
		login_wrapper.style.display = "none";
		register_border.style.display = "block";
		register_wrapper.style.display = "block";
	});
	register_button.addEventListener("click", function() {
		var username = document.getElementsByClassName("register-input username")[0].value;
		var password = document.getElementsByClassName("register-input password")[0].value;
		var repeat_password = document.getElementsByClassName("register-input repeat-password")[0].value;
		if(!empty(username)) {
			if(password == repeat_password) {
				if(!empty(password)) {
					register(username, password);
				}
				else {
					login_text.style.display = "block";
					login_text.textContent = "No password entered.";
				}
			}
			else {
				login_text.style.display = "block";
				login_text.textContent = "Passwords do not match.";
			}
		}
		else {
			login_text.style.display = "block";
			login_text.textContent = "No username entered.";
		}
	});
	anonymous_button.addEventListener("click", function() {
		window.location.href = "./anonymous";
	});
	document.getElementsByClassName("info-icon")[0].addEventListener("click", function() {
		if(document.getElementsByClassName("info-wrapper")[0].style.display == "block") {
			document.getElementsByClassName("info-wrapper")[0].style.display = "none";
		}
		else {
			document.getElementsByClassName("info-wrapper")[0].style.display = "block";
		}
	});
	document.getElementsByClassName("close-icon")[0].addEventListener("click", function() {
		document.getElementsByClassName("info-wrapper")[0].style.display = "none";
	});
	document.addEventListener("keydown", function(e) {
		if(e.which == 13) {
			if(login_wrapper.style.display == "block") {
				login_button.click();
			}
			else if(register_wrapper.style.display == "block") {
				register_button.click();
			}
		}
	});
	function login(username, password) {
		login_text.style.display = "block";
		login_text.textContent = "Loading...";
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState == XMLHttpRequest.DONE) {
				if(!empty(xhr.response)) {
					var response = JSON.parse(xhr.response);
					if(response["action"] == "refresh") {
						window.localStorage.setItem("password-hash", CryptoJS.SHA512(password).toString(CryptoJS.enc.Hex));
						window.localStorage.setItem("private-key", response["private_key"]);
						window.localStorage.setItem("public-key", response["public_key"]);
						location.reload();
					}
					else {
						login_text.style.display = "block";
						login_text.textContent = response["text"];
					}
				}
			}
		}
		xhr.open("POST", "/login", true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify({
			username: username, password: password
		}));
	}
	function register(username, password) {
		login_text.style.display = "block";
		login_text.textContent = "Loading...";
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState == XMLHttpRequest.DONE) {
				if(xhr.response == "done") {
					login_switch.click();
					document.getElementsByClassName("login-input username")[0].value = username;
					document.getElementsByClassName("login-input password")[0].value = password;
					login_button.click();
				}
				else {
					login_text.style.display = "block";
					login_text.textContent = xhr.response;
				}
			}
		}
		xhr.open("POST", "/register", true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify({
			username: username, password: password
		}));
	}
	function empty(text) {
		if(text != null && text != "" && typeof text != "undefined" ) {
			return false;
		}
		return true;
	}
	function initialize() {
		if(local_storage_available()) {
			var clear_storage = false;
			if(clear_storage) {
				window.localStorage.clear();
				console.log(window.localStorage);
			}
			if(detect_mobile()) {
				document.getElementsByTagName("body")[0].setAttribute("id", "mobile");
			}
			else {
				document.getElementsByTagName("body")[0].setAttribute("id", "desktop");
			}
			var theme = window.localStorage.getItem("theme");
			if(!empty(theme)) {
				if(document.getElementsByClassName("theme-css")[0].getAttribute("data-color") == "dark") {
					if(theme == "light") {
						document.getElementsByClassName("theme-css")[0].setAttribute("href", "./assets/css/login-light.css");
						document.getElementsByClassName("theme-css")[0].setAttribute("data-color", "light");
					}
				}
			}
		}
		else {
			document.body.innerHTML = '<div class="error-overlay noselect"></div><div class="error-wrapper" style="width:300px;height:180px;left:calc(50% - 150px);top:calc(50% - 90px);"><div class="error-top"><span class="error-title">Error - Local Storage Required</span></div><div class="error-bottom"><span class="error-text">Your browser needs to support Local Storage.</span><a href="./"><button class="error-button">Refresh</button></a></div></div>';
		}
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
	function detect_mobile() {
		var check = false;
		(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
		return check;
	};
});
	