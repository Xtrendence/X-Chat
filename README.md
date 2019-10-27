# X-Chat
X:/Chat is a web application that uses HTML, CSS, and JavaScript on the front-end, and NodeJS on the back-end. It allows users to communicate with one another in a secure manner (although I'm new to NodeJS, and cannot guarantee said security).

JavaScript and local storage are absolutely **mandatory** for the web app to function. Local storage is used to store public keys, private keys, settings, and a whole lot more.

If you use the "Anonymous Chat" feature, absolutely nothing is stored by the server. I wanted to make the most secure form of communication I could think of, and I ended up choosing not to even store conversation logs through the anonymous chat. When you click on the "anonymous chat" button, you get redirected to "/anonymous", where an ID is generated for you, along with a public key and a private key. These are solely saved on your browser (in the local storage). The server does not store any of this information. The only thing the server stores is the conversation ID, and the creation time. This is done so that conversations can be set to expire after an hour. After the loading is complete, you can send your URL to anyone you want, and have them connect to you. Once they do, they also get a public/private key pair generated for them, as well as an ID. You are then provided with their public key and their ID. When you send a message, you encrypt it using their RSA-2048 public key, which they then decrypt on their side (locally) using their private key. Since the message is encrypted on the client side, the server never knows what is being said. Refreshing the page deletes the messages for whoever refreshed, as the messages aren't stored **anywhere**. Because of the fact that nothing is stored on the server though, it means users can easily change their IDs and such, which is why this project was made to be used by small groups, rather than the general public. Having the server store anonymous conversations would provide the benefit of the conversations being immutable by users, but it would mean that the server can modify them, and that logs would exist. So would you rather trust your friend, or some random server?

The normal chat is more like your generic chat application. Messages are still encrypted on the client side with RSA-2048, and users' private keys are encrypted with AES-256-CTR, which uses the SHA512 hash of the user's password as the decryption key. The user's password is stored using BCrypt with 10 salt rounds. In short, unless the server code is modified or something to capture the user's private key, there's absolutely no way to get the content of a conversation. The user's settings, contacts, and other data are stored in JSON format in text files for easy access. These are stored in plaintext, but it'd be easy to encrypt them with the user's password and AES. If you wish to make that a reality, remember, there are already functions written to make it easier. You can use the "aes_encrypt(plaintext, password)" and "aes_decrypt(encrypted, password)" functions that I wrote to easily encrypt/decrypt whatever you want.

There might be some bugs or some unexpected behavior, but this is to be expected, this is, after all, my first NodeJS project. If you try to break the app, you'll very likely succeed. There aren't as many validation checks and such as I'd like, but there are enough to protect user's accounts and conversations. I apologize in advance if anything does go wrong though.

![X:/Chat](https://www.xtrendence.com/portfolio/projects/x-chat/thumbnail.jpg)

### To Do

- [ ] Add comments to the code.

- [ ] Add the option to store anonymous chat messages in local storage.

- [ ] Create an ElectronJS version of X:/Chat.
