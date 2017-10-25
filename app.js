var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var mysql = require('mysql');

var index = require('./routes/index');

var app = express();
var server = require('http').createServer(app);
var socketIo = require('socket.io').listen(server);
//var usernames = []; for group chat
var chat_users = {};

server.listen(9013);

var connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "justdoit2",
  database: "chat"
});

connection.connect();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);


app.get('/', function(req, res) {
	res.sendfile(__dirname, 'index');
});

//listing message history
app.get('/list/:input?', function(req, res) {
	connection.query('SELECT username_1, message, time, receiver FROM users JOIN messages ON users.username=messages.username_1 WHERE username=? OR receiver=? ORDER BY username_id', [req.params.input, req.params.input], function(err, result) {
		if(err) throw err;
		if(result) {
			res.send(result);
		}
	});
});

socketIo.sockets.on('connection', function(socket) {
	socket.on('new user', function(data, callback) {
		callback(true);
		socket.username = data;
		connection.query('SELECT username FROM users WHERE username=?', [socket.username], function(err, result) {
			if(err) throw err;
			if(result.length === 0) {
				connection.query('INSERT INTO users(username) VALUES(?)', [socket.username]);
			}
		});
		//usernames.push(socket.username);  for group chat
		chat_users[socket.username] = socket;
		updateUsernames();
	});
	
	function updateUsernames() {
		//socketIo.sockets.emit('usernames', usernames); for group chat
		socketIo.sockets.emit('usernames', Object.keys(chat_users));
	}
	
	
	//when message starts with '/w ' and the name of the receiver, the message can only be seen by the sender and the receiver, otherwise everyone in the group chat can see the message
	socket.on('send message', function(data, callback) {
		var msg = data.trim();
		if(msg.substr(0,3) === '/w ') {
			msg = msg.substr(3);
			var indx = msg.indexOf(' ');
			if(indx !== -1) {
				var currentdate = new Date();
				var datetime =  currentdate.getDate() + "/"
							+ (currentdate.getMonth()+1)  + "/" 
							+ currentdate.getFullYear() + "  "  
							+ currentdate.getHours() + ":"  
							+ currentdate.getMinutes() + ":" 
							+ currentdate.getSeconds();
				var name = msg.substring(0, indx);
				var msg = msg.substring(indx + 1);
				if(name in chat_users) {
					chat_users[name].emit('whisper', {msg: msg, user: socket.username});
					chat_users[socket.username].emit('whisper', {msg: msg, user: socket.username});
					//sender, receiver, message and time when the message was sent are inserted into database
					connection.query('INSERT INTO messages(username_1, message, time, receiver) VALUES(?,?,?,?)', [socket.username, msg, datetime, name]);
				}
				else {
					callback('No such user!');
				}
			}
			else {
				callback('Please enter a message');
			}
		}
		else {
		socketIo.sockets.emit('new message', {msg: msg, user: socket.username});  //sent to everyone including sender
		//socket.broadcast.emit('new message', data); //sent to everyone except the sender
		}
	});
	
	socket.on('disconnect', function(data) {
		if(!socket.username) return;
		//usernames.splice(usernames.indexOf(socket.username), 1); for group chat
		delete chat_users[socket.username];
		updateUsernames();
	});
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
