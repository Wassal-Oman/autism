// import needed libraries
const path = require("path");
const express = require("express");
const firebase = require("firebase");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const Multer = require("multer");
const router = express.Router();

// firebase configuration
const config = {
  apiKey: "AIzaSyAdYgE5n80X3YzZCAWIzzWOwcj-ooDfSFk",
  authDomain: "autism-e9aa9.firebaseapp.com",
  databaseURL: "https://autism-e9aa9.firebaseio.com",
  projectId: "autism-e9aa9",
  storageBucket: "autism-e9aa9.appspot.com",
  messagingSenderId: "394165222262"
};

// initialize firebase
firebase.initializeApp(config);

// firebase admin configuration
const adminConfig = require(path.join(__dirname, "ServiceAccountKey"));

// initialize firebase admin
admin.initializeApp({
  credential: admin.credential.cert(adminConfig),
  databaseURL: "https://autism-e9aa9.firebaseio.com"
});

// firebase database
const db = admin.firestore();

// firebase storage
const storage = new Storage({
  projectId: "autism-e9aa9",
  keyFilename: path.join(__dirname, "ServiceAccountKey.json")
});

// storage bucket
const bucket = storage.bucket("gs://autism-e9aa9.appspot.com/");

// multer storage
const multer = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// middleware function to check for logged-in users
const sessionChecker = (req, res, next) => {
  if (!firebase.auth().currentUser && !req.session.user) {
    res.redirect("/login");
  } else {
    next();
  }
};

// default
router.get("/", sessionChecker, (req, res) => {
  res.redirect("/home");
});

// login - GET
router.get("/login", (req, res) => {
  if (firebase.auth().currentUser) {
    res.redirect("/home");
  }
  res.render("login");
});

// login - POST
router.post("/login", (req, res) => {
  // get user input
  const { email, password } = req.body;

  // authenticate user
  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then(data => {
      // get user details
      db.collection("users")
        .doc(data.user.uid)
        .get()
        .then(document => {
          if (document.exists) {
            console.log(document.data());
            req.session.user = document.data();
            if (document.data().type === "Admin") {
              res.redirect("/home");
            } else {
              console.log("Customer is trying to login");
              res.redirect("/logout");
            }
          } else {
            console.log("No User Data");
            res.redirect("/logout");
          }
        })
        .catch(err => {
          console.log(err);
          res.redirect("/500");
        });
    })
    .catch(err => {
      console.log(err);
      req.flash("error", err.message);
      res.redirect("/login");
    });
});

// home
router.get("/home", sessionChecker, (req, res) => {
  // get count of users
  const userCountPromise = getUsersCount();

  // get count of centers
  const centerCountPromise = getCentersCount();

  Promise.all([userCountPromise, centerCountPromise])
    .then(val => {
      res.render("home", {
        users: val[0],
        centers: val[1]
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// users
router.get("/users", sessionChecker, (req, res) => {
  // empty array
  let users = [];

  // get data
  db.collection("users")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        users.push(doc.data());
      });

      // render users page
      res.render("users", {
        users
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// delete user
router.get("/users/:id/:type/delete", sessionChecker, (req, res) => {
  // get user id
  const id = req.params.id;
  const type = req.params.type;

  if (type === "Admin") {
    res.redirect("/users");
  } else {
    // delete user from authentication
    let authDeletePromise = admin.auth().deleteUser(id);
    let dbDeletePromise = db
      .collection("users")
      .doc(id)
      .delete();

    Promise.all([authDeletePromise, dbDeletePromise])
      .then(() => {
        console.log("user deleted");
        res.redirect("/users");
      })
      .catch(err => {
        console.log("auth error", err);
        res.redirect("/users");
      });
  }
});

// edit user
router.get("/users/:id/edit", sessionChecker, (req, res) => {
  // get user id
  const id = req.params.id;

  // get user details
  db.collection("users")
    .doc(id)
    .get()
    .then(document => {
      const user = {
        id: document.data().id,
        name: document.data().name,
        email: document.data().email,
        phone: document.data().phone,
        address: document.data().address,
        type: document.data().type
      };

      // render edit page
      res.render("editUser", {
        user
      });
    });
});

// update user
router.post("/users/update", sessionChecker, (req, res) => {
  // get inputs
  const { id, name, email, phone, address, type } = req.body;

  // update user
  db.collection("users")
    .doc(id)
    .update({
      id,
      name,
      email,
      phone,
      address,
      type
    })
    .then(val => {
      console.log("user updated", val);
      res.redirect("/users");
    })
    .catch(err => {
      console.log(err);
      res.redirect("/users");
    });
});

// abayas
router.get("/centers", sessionChecker, (req, res) => {
  // empty array
  let centers = [];

  // get data
  db.collection("centers")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        centers.push({
          id: doc.id,
          name: doc.data().name,
          description: doc.data().description,
          location: doc.data().location,
          latitude: doc.data().latitude,
          longitude: doc.data().longitude,
          image: doc.data().image
        });
      });

      // render users page
      res.render("centers", {
        centers
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add abaya
router.get("/centers/add", sessionChecker, (req, res) => {
  res.render("addCenter");
});

// store abaya
router.post(
  "/centers/store",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get inputs
    const { name, location, description, latitude, longitude } = req.body;
    const file = req.file;

    if (file) {
      uploadImageToStorage(file)
        .then(val => {
          // add sweet data to firestore
          db.collection("centers")
            .doc()
            .set({
              name,
              location,
              description,
              latitude,
              longitude,
              image_name: val[0],
              image: val[1]
            })
            .then(val => {
              console.log(val);
              res.redirect("/centers");
            })
            .catch(err => {
              console.log(err);
              res.redirect("/centers/add");
            });
        })
        .catch(err => {
          console.log(err);
          res.redirect("/centers/add");
        });
    } else {
      console.log("No file has been chosen");
      res.redirect("/centers/add");
    }
  }
);

// view center details
router.get("/centers/:id", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;
  const doctors = [];

  // check for center id
  if (id) {
    db.collection("centers")
      .doc(id)
      .get()
      .then(doc => {
        if (doc.exists) {
          // get center data
          const center = {
            id: doc.id,
            name: doc.data().name,
            description: doc.data().description,
            location: doc.data().location,
            image: doc.data().image,
            image_name: doc.data().image_name,
            latitude: doc.data().latitude,
            longitude: doc.data().longitude
          };

          // load list of doctors belongs to center
          db.collection("doctors")
            .where("center_id", "==", center.id)
            .get()
            .then(snapshot => {
              if (snapshot.empty) {
                res.render("viewCenter", {
                  center,
                  doctors
                });
              } else {
                // get all doctors
                snapshot.forEach(doc => {
                  doctors.push({
                    id: doc.id,
                    name: doc.data().name,
                    email: doc.data().email,
                    phone: doc.data().phone,
                    type: doc.data().type,
                    center_id: doc.data().center_id
                  });
                });

                // render view
                res.render("viewCenter", {
                  center,
                  doctors
                });
              }
            })
            .catch(err => {
              console.log(err);
              res.redirect("/centers");
            });
        } else {
          console.log("No data available for this center");
          res.redirect("/centers");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/centers");
      });
  } else {
    console.log("No id for center");
    res.redirect("/centers");
  }
});

// delete abaya
router.get("/centers/:id/delete", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  if (id) {
    // get image file
    db.collection("centers")
      .doc(id)
      .get()
      .then(doc => {
        // load users' data
        if (doc.exists) {
          // delete image file from firebase storage
          bucket.file(doc.data().image_name).delete((err, api) => {
            if (err) {
              console.log(err);
              res.redirect("/centers");
            } else {
              db.collection("centers")
                .doc(id)
                .delete()
                .then(val => {
                  // delete doctors associated to this center
                  db.collection("doctors")
                    .where("center_id", "==", id)
                    .get()
                    .then(snapshot => {
                      if (snapshot.docs.length > 0) {
                        // delete documents from database
                        snapshot.forEach(doc => {
                          db.collection("doctors")
                            .doc(doc.id)
                            .delete();
                        });

                        console.log(val);
                        res.redirect("/centers");
                      } else {
                        console.log(val);
                        res.redirect("/centers");
                      }
                    })
                    .catch(err => {
                      console.log(err);
                      res.redirect("/centers");
                    });
                })
                .catch(err => {
                  console.log(err);
                  res.redirect("/centers");
                });
            }
          });
        } else {
          res.redirect("/centers");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/centers");
      });
  } else {
    console.log("Center ID cannot be empty");
    res.redirect("/centers");
  }
});

// edit center
router.get("/centers/:name/edit", sessionChecker, (req, res) => {
  // get sweet name
  const name = req.params.name;
  let data = [];

  if (name) {
    // get sweet details
    db.collection("centers")
      .where("name", "==", name)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          // fetch all results
          snapshot.forEach(doc => {
            data.push({
              id: doc.id,
              name: doc.data().name,
              location: doc.data().location,
              latitude: doc.data().latitude,
              longitude: doc.data().longitude,
              description: doc.data().description,
              image: doc.data().image,
              image_name: doc.data().image_name
            });
          });

          // render edit sweet page
          res.render("editCenter", {
            center: data[0]
          });
        } else {
          console.log("No data available for this center");
          res.redirect("/centers");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/centers");
      });
  } else {
    console.log("Cannot get center name");
    res.redirect("/centers");
  }
});

// update center
router.post(
  "/centers/update",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get center details
    const {
      id,
      name,
      location,
      description,
      latitude,
      longitude,
      image_name
    } = req.body;
    const file = req.file;

    if (file) {
      // delete old file
      bucket.file(image_name).delete((err, api) => {
        if (err) {
          console.log(err);
          res.redirect("/centers");
        } else {
          // try uploading the file
          uploadImageToStorage(file)
            .then(val => {
              // edit sweet data in firestore
              db.collection("centers")
                .doc(id)
                .update({
                  name,
                  location,
                  description,
                  latitude,
                  longitude,
                  image_name: val[0],
                  image: val[1]
                })
                .then(val => {
                  console.log(val);
                  res.redirect("/centers");
                })
                .catch(err => {
                  console.log(err);
                  res.redirect(`/centers/${name}/edit`);
                });
            })
            .catch(err => {
              console.log(err);
              res.redirect(`/centers/${name}/edit`);
            });
        }
      });
    } else {
      // edit sweet data in firestore
      db.collection("centers")
        .doc(id)
        .update({
          name,
          location,
          description,
          latitude,
          longitude
        })
        .then(val => {
          console.log(val);
          res.redirect("/centers");
        })
        .catch(err => {
          console.log(err);
          res.redirect(`/centers/${name}/edit`);
        });
    }
  }
);

// add doctor
router.get("/centers/:id/add-doctor", sessionChecker, (req, res) => {
  // get center id
  const center_id = req.params.id;

  if (center_id) {
    res.render("addDoctor", {
      center_id
    });
  } else {
    console.log("Center ID unknown");
    res.redirect("/centers");
  }
});

// store doctor
router.post("/centers/store-doctor", sessionChecker, (req, res) => {
  // get all passed values
  const { name, email, phone, type, center_id } = req.body;
  console.log(req.body);

  // store doctor data inside a database
  db.collection("doctors")
    .doc()
    .set({
      name,
      email,
      phone,
      type,
      center_id
    })
    .then(val => {
      console.log(val);
      res.redirect(`/centers/${center_id}`);
    })
    .catch(err => {
      console.log(err);
      res.redirect("/centers");
    });
});

// delete doctor
router.get(
  "/centers/:center_id/:doctor_id/delete-doctor",
  sessionChecker,
  (req, res) => {
    // get center id and doctor id
    const center_id = req.params.center_id;
    const doctor_id = req.params.doctor_id;

    if (center_id && doctor_id) {
      db.collection("doctors")
        .doc(doctor_id)
        .delete()
        .then(() => {
          console.log("Doctor deleted successfully");
          res.redirect(`/centers/${center_id}`);
        })
        .catch(err => {
          console.log(err);
          res.redirect("/centers");
        });
    } else {
      console.log("Center ID or Doctor ID are unknown");
      res.redirect("/centers");
    }
  }
);

// edit doctor
router.get(
  "/centers/:center_id/:doctor_id/edit-doctor",
  sessionChecker,
  (req, res) => {
    // get center id and doctor id
    const center_id = req.params.center_id;
    const doctor_id = req.params.doctor_id;

    if (center_id && doctor_id) {
      // get doctor details
      db.collection("doctors")
        .doc(doctor_id)
        .get()
        .then(doc => {
          if (doc.exists) {
            res.render("editDoctor", {
              center_id,
              doctor_id,
              doctor: doc.data()
            });
          } else {
            console.log(`No data for ID: ${doctor_id}`);
            res.redirect(`/centers/${center_id}`);
          }
        })
        .catch(err => {});
    } else {
      console.log("Center ID or Doctor ID are unknown");
      res.redirect("/centers");
    }
  }
);

// update doctor
router.post("/centers/update-doctor", sessionChecker, (req, res) => {
  // get user inputs
  const { name, email, phone, type, center_id, doctor_id } = req.body;
  console.log(req.body);

  // update doctor
  db.collection("doctors")
    .doc(doctor_id)
    .update({
      name,
      email,
      phone,
      type
    })
    .then(val => {
      console.log("Doctor updated successfully");
      res.redirect(`/centers/${center_id}`);
    })
    .catch(err => {
      console.log(err);
      res.redirect("/centers");
    });
});

// logout
router.get("/logout", sessionChecker, (req, res) => {
  firebase.auth().signOut();
  res.redirect("/login");
});

// 500
router.get("/500", (req, res) => {
  res.render("500");
});

/**
 * Function to handle files
 */
const uploadImageToStorage = file => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject("No image file");
    }

    let newFileName = `${file.originalname}_${Date.now()}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });

    blobStream.on("error", err => {
      reject(err);
    });

    blobStream.on("finish", () => {
      // The public URL can be used to directly access the file via HTTP.
      const url = `https://firebasestorage.googleapis.com/v0/b/autism-e9aa9.appspot.com/o/${
        fileUpload.name
      }?alt=media`;
      resolve([fileUpload.name, url]);
    });

    blobStream.end(file.buffer);
  });
};

/**
 * Function to get user count
 */
const getUsersCount = count => {
  return new Promise((reslove, reject) => {
    db.collection("users")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          reslove(0);
        } else {
          reslove(snapshot.docs.length);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

/**
 * Function to get user count
 */
const getCentersCount = centers => {
  return new Promise((reslove, reject) => {
    db.collection("centers")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          reslove(0);
        } else {
          reslove(snapshot.docs.length);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

// export router
module.exports = router;
