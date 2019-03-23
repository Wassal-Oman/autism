// import needed libraries
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");

// routers
const dashboard = require("./routes/dashboard");

// initialize app and set port
const app = express();
const port = process.env.PORT || 3000;

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(flash());
app.use(
  session({
    key: "user",
    secret: "AUTISM",
    resave: false,
    saveUninitialized: false
  })
);

// notification messages middleware
app.use(function(req, res, next) {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.warning = req.flash("warning");
  next();
});

// set the view engine and views folder
app.set("view engine", "ejs");
app.set("views", "views");

// routes
app.use("/", dashboard);

// if route does not exist
app.use((req, res, next) => {
  res.render("404");
});

// run server
app.listen(port, () => console.log(`Listening on port ${port}`));
