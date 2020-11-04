require('dotenv').config();
const express = require("express");
const app = express();
const request = require('request');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const alert = require('alert');
const mongoose = require('mongoose');
const session = require('express-session')
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const async = require('async');
const crypto = require('crypto');
const flash = require('express-flash');

mongoose.connect('mongodb+srv://admin-daniel:Test123@cluster0.s4857.mongodb.net/portfolioDB', { useNewUrlParser: true, useUnifiedTopology: true });



app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));

app.use(session({
    secret: 'aklnodingaoinurjnanunva91n29',
    resave: false,
    saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

mongoose.set('useCreateIndex', true);

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String, },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

userSchema.plugin(passportLocalMongoose);

const postSchema = new mongoose.Schema({
    title: String,
    date: String,
    excerpt: String,
    content: String,
    image: String
});

const commentSchema = mongoose.Schema({
    postId: String,
    name: String,
    comment: String
});

const sponsorSchema = mongoose.Schema({
    name: String,
    description: String
});

const User = mongoose.model('User', userSchema)
const Post = mongoose.model('Post', postSchema);
const Comment = mongoose.model('Comment', commentSchema);
const Sponsor = mongoose.model('Sponsor', sponsorSchema);


passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, "/public"));
    },

    // By default, multer removes file extensions so let's add them back
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '_' + Date.now() + file.originalname);
    }
});
let upload = multer({
    storage: storage, onFileUploadStart: function (file) {
        console.log(file.originalname + ' is starting ...')
    },
})
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
    Post.find({}, (err, posts) => {
        res.render('index', { posts: posts, isAuthenticated: req.isAuthenticated() });
    })

});

app.get('/login', function (req, res) {
    res.render('login')
});

app.get('/register', function (req, res) {
    res.render('signup')
});

app.get('/forgot', function (req, res) {
    res.render('forgot');
})

app.get('/about', function (req, res) {
    res.render('about')
})


app.get('/post/:title', function (req, res) {
    const title = req.params.title;
    Post.findOne({ title: title }, function (err, post) {
        if (err) {
            console.log(err);
        }
        Comment.find({}, (err, comments) => {
            if (err) {
                console.log(err);
            }
            res.render('detail', {
                post: post,
                isAuthenticated: req.isAuthenticated(),
                comments: comments,
            });
        });

    });

});

app.get('/posts/:page', (req, res) => {
    const resPerPage = 2;
    const page = req.params.page;

    Post.find({}, function (err, posts) {
        const numOfPosts = posts.length;

        const selectedPosts = posts.slice((page - 1) * resPerPage, page * resPerPage)

        Comment.find({}, (err, comments) => {
            Sponsor.find({}, (err, sponsors) => {
                res.render('posts', {
                    posts: selectedPosts,
                    currentPage: page,
                    pages: Math.ceil(numOfPosts / resPerPage),
                    numOfResults: numOfPosts,
                    comments: comments,
                    sponsors: sponsors,
                    isAuthenticated : req.isAuthenticated()
                });
            });
        });

    });

});
app.get('/reset/:token', function (req, res) {
    User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('reset', { user: user });
    });
});

app.get('/compose', function (req, res) {
    res.render('compose');
});

app.get('/sponsors', function (req, res) {
    if (req.isUnauthenticated()) {
        res.redirect('/');
    };

    Sponsor.find({}, (err, sponsors) => {
        res.render('sponsors', { sponsors: sponsors });
    });


});

app.get('/logout', function (req, res) {
    req.logout();
    console.log(req.isAuthenticated());
    res.redirect('/');
});

app.post('/register', function (req, res) {
    User.register({ username: req.body.username }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            res.redirect('/register');
        } else {
            passport.authenticate('local')(req, res, function () {
                res.redirect('/');
            });
        }
    });
});

app.post('/login', function (req, res) {
    const user = new User({
        username: req.body.username,
        password: req.body.password
    });

    if (req.isUnauthenticated()) {
        req.login(user, function (err) {
            if (err) {
                console.log(err);
                redirect('/login')
            } else {
                passport.authenticate('local')(req, res, function () {
                    res.redirect('/');
                });
            }
        });
    }
});

app.post('/forgot', function (req, res, next) {
    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            User.findOne({ username: req.body.username }, function (err, user) {
                if (!user) {
                    req.flash('error', 'No account with that email address exists.');
                    return res.redirect('/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                user.save(function (err) {
                    done(err, token, user);
                });
            });
        },
        function (token, user, done) {
            const smtpTransport = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: user.username,
                    pass: process.env.RAZZLE_GMAIL_PASS
                }
            });
            var mailOptions = {
                to: "danielogbuti@gmail.com",
                from: 'passwordreset@demo.com',
                subject: 'Node.js Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    req.flash('info', 'An e-mail has been sent to ' + user.username + ' with further instructions.');
                    done(err, 'done');
                }
            });
        }
    ], function (err) {
        if (err) return next(err);
        res.redirect('/forgot');
    });
});

app.post('/reset/:token', function (req, res) {

    User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('back');
        }
        console.log(req.body.password);
        user.setPassword(req.body.password, function (err) {
            console.log(err);
            user.resetPasswordExpires = undefined;
            user.resetPasswordToken = undefined;
            user.save(function (err) {
                req.flash('info', 'Password Successfully Changed');
                if (!err) {
                    if (req.isAuthenticated()) {
                        res.redirect('/posts/1')
                    } else {

                        res.redirect('/login')
                    }
                } else {
                    console.log(err);
                }
            })
        });
    });
});

app.post('/upload', upload.single('feature_image'), (req, res) => {
    const postId = req.body.id;
    const isEdit = req.body.post;
    const title = req.body.title;
    const excerpt = req.body.excerpt;
    const content = req.body.content;
    const image = req.body.fileImage;

    const today = new Date()
    const newDate = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    const length = path.join(__dirname, '/public').length;

    if (isEdit === 'true') {

        Post.findById(postId, function (err, post) {
            if (err) {
                console.log(err);
            }
            post.title = title;
            post.excerpt = excerpt;
            post.content = content;
            if (!req.file) {
                post.image = image;
            } else {
                post.image = req.file.path.slice(length + 1)
            }
            post.save(function () {
                console.log(post.content);
                res.redirect('/post/' + req.body.title);
            })

        })

    } else {

        if (req.fileValidationError) {
            console.log(req.fileValidationError);
        }
        else if (!req.file) {
            console.log('Please select an image to upload');
        }

        const post = new Post({
            id: today,
            title: req.body.title,
            date: newDate,
            excerpt: req.body.excerpt,
            content: req.body.content,
            image: req.file.path.slice(length + 1)
        });


        post.save(function () {
            res.redirect('/post/' + req.body.title);
        });

    }

});


app.post('/update', function (req, res) {
    const deleteTitle = req.body.delete;
    const editTitle = req.body.edit;

    if (deleteTitle) {
        Post.findOneAndDelete({ title: deleteTitle }, function () {
            res.redirect('/');
        })

    } else if (editTitle) {
        Post.findOne({ title: editTitle }, function (err, post) {
            if (err) {
                console.log(err);
            }
            res.render('compose', { post: post, isEdit: true })
        })

    } else {
        console.log("Neither edit or delete");
    }
});

app.post("/comments", (req, res) => {
    const name = req.body.commentName;
    const commentPost = req.body.commentPost;
    const postId = req.body.postId;
    const today = new Date();
    const title = req.body.title;

    if (req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
        return res.json({ "responseError": "something goes to wrong" });
    }
    const secretKey = process.env.RAZZLE_CAPTCHA_SECRET;

    const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;

    request(verificationURL, function (error, response, body) {
        body = JSON.parse(body);
        console.log(body);

        if (body.success !== undefined && !body.success) {
            return res.json({ "responseError": "Failed captcha verification" });
        }


        const comment = new Comment({
            id: today,
            postId: postId,
            name: name,
            comment: commentPost
        });

        comment.save(() => {
            res.redirect('/post/' + title);
        });

    });

});

app.post('/contact', (req, res) => {
    const GMAIL_USER = process.env.RAZZLE_GMAIL_USER
    const GMAIL_PASS = process.env.RAZZLE_GMAIL_PASS

    if (req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
        return res.json({ "responseError": "something goes to wrong" });
    }
    const secretKey = process.env.RAZZLE_CAPTCHA_SECRET;

    const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;

    request(verificationURL, function (error, response, body) {
        body = JSON.parse(body);
        console.log(body);

        if (body.success !== undefined && !body.success) {
            return res.json({ "responseError": "Failed captcha verification" });
        }
        // Instantiate the SMTP server
        const smtpTrans = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_PASS
            }
        });

        const mailOpts = {
            from: 'danielogbuti@gmail.com', // This is ignored by Gmail
            to: GMAIL_USER,
            subject: 'New message from contact form at localhost',
            text: `${req.body.name} (${req.body.email}) says: ${req.body.information}`
        }

        smtpTrans.sendMail(mailOpts, (error, response) => {
            if (error) {
                console.log(error);;
                res.redirect('/')
            }
            else {
                alert('Success');
                res.redirect('/') // Show a page indicating success
            }
        })


    });

})

app.post('/sponsors', (req, res) => {
    const name = req.body.name;
    const description = req.body.description;

    const sponsor = new Sponsor({
        name: name,
        description: description
    });

    sponsor.save(() => {
        res.redirect('/sponsors');
    });

});

app.post('/sponsor-delete', (req, res) => {
    const id = req.body.id;

    Sponsor.findByIdAndDelete(id, () => {
        res.redirect('/sponsors');
    })

});

let port = process.env.PORT;
if (port == null || port == "") {
    port = 3000;
}
app.listen(port, function () {
    console.log("Server started successfully");
})

