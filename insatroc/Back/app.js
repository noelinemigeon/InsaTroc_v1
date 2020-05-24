const express = require('express');
const bodyParser = require('body-parser'); //permet de formater les données en JSON
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require("bcrypt");
const saltRounds = 10;
const jwt = require("jsonwebtoken");
const tokenValidator = require("./jwt_validator")

const mysql = require('mysql')
const con = mysql.createConnection({
  database: "insatroc",
  host: "localhost",
  user: "toto2",
  password: "pwdtoto"
});
const jwtKey = "privateKey";


//const mariadb = require('mariadb');
//const pool = mariadb.createPool({database:'insatroc', host: 'localhost', user:'toto2', password: 'pwdtoto'});

const app = express();

function attributeID(category){
  var categoryID;

  switch (category){
    case " Chambre":
    categoryID = 1;
    break;

    case " Cuisine":
    categoryID = 2;
    break;

    case " Salle de bain":
    categoryID = 3;
    break;

    case " Bureau":
    categoryID = 4;
    break;

    case " Loisirs/Sport":
    categoryID = 5;
    break;

    case " Autre":
    categoryID = 6;
    break;
    }
  return categoryID;
}
function attributeCategory(categoryID){
  var category = [];

  for(let i in categoryID){
    switch (categoryID[i]){
      case 1:
      category.push(" Chambre");
      break;

      case 2:
      category.push(" Cuisine");
      break;

      case 3:
      category.push(" Salle de bain");
      break;

      case 4:
      category.push(" Bureau");
      break;

      case 5:
      category.push(" Loisirs/Sport");
      break;

      case 6:
      category.push(" Autre");
      break;
      }
  }
  return category;
}

function getUsernameFromID(studentID){
  con.query("SELECT Username FROM Student WHERE StudentID = '"+studentID+"'", function(err, result, fields){
    if(err) throw err;
    return result;
  })
}


function addslashes(ch) { //fonction pour échapper les apostrophes et autres qui créaient des erreurs
  ch = ch.replace(/\\/g,"\\\\");
  ch = ch.replace(/\'/g,"\\'");
  ch = ch.replace(/\"/g,"\\\"");
  return ch;
}

app.use((req, res, next) => { //header permettant de communiquer entre les deux serveurs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  next();
});

app.use(bodyParser.json({limit:'10mb'}));//formate en JSON les données pour n'importe quelle route



/*********************************
 * Passport
 * ******************************/

// define strategy used by passport
passport.use(new LocalStrategy({
  usernameField: 'email'
},
function(username, password, done) {
  con.query("SELECT Email FROM Student where Email = '"+username+ "'",function (err, user, fields) {
    console.log(user);
    if (err) {
      throw err;
    } else if (user.length==0){
      console.log("User not found");
      return done("User not found", false);
    } else {
      console.log("Correct user");
      con.query("SELECT Password FROM Student where Email = '"+username+"'", function (err, result, fields){
        if (err) {
          throw err;
        } else {
          /*var string = JSON.stringify(result); //convertit le result en JSON
          console.log(string);
          var json = JSON.parse(string); //sépare les éléments du JSON
          console.log(json);
          console.log("selection : ", json[0].Password);*/
          var motdepasse = result[0].Password;
          bcrypt.compare (password, motdepasse, function(err, isMatch){
            if (err) {
              throw err;
            } else if (!isMatch){
              console.log("The password doesn't match!");
              return done("Incorrect Email/Password credentials", false);
            } else {
              console.log("Correct password");
              return done(null, username);
            }
          })
        }
      });
    }
  });
}));

// to facilitate user data storage in the session and retrieving the data on subsequent requests
passport.serializeUser(function(user, done) {
if(user) done(null, user);
});
passport.deserializeUser(function(id, done) {
done(null, id);
});

app.use(passport.initialize());
app.use(passport.session());

/***************** Authentification**************** */

// middleware that intercepts the authentication request and makes the Passport authentication call
const auth = () => {
return (req, res, next) => {
  console.log("requête d'authentification reçue dans auth :");
  console.log(req.body);
  var username;
  var userID;
  passport.authenticate('local', (error, user, info) => {
    console.log("utilisateur :");
    console.log(user);
    console.log(info);
    // if Passport catches an error
    if(error) res.status(400).json({"statusCode" : 200, "message" : error});
    // if a user is found
    else if(user){
      con.query("SELECT * FROM Student WHERE Email = '"+user+"'", function (err, result, fields) {
        if (err) throw err;
        username = result[0].Username;
        userID = result[0].StudentID;
        const token = jwt.sign({ userID }, jwtKey, {algorithm: "HS256",expiresIn:'1h'});
        res.status(200).json({"token" : token, "username" : username});
      });
    }
    // if user is not found
    else{
      res.status(401).json({"message" : "wrong authentication", info});
    }
    // req.login(user, function(error) {
    //   console.log("passport.authenticate");
    //   if(error) return next(error);
    //   next();
    // });
  })(req, res, next);
}}


// requête http POST pour l'authentification
app.post('/authenticate/', auth(), (req, res) => {
console.log("requête d\'authentification reçue");
console.log(req.body);
res.status(200).json({"statusCode" : 200, "message" : "hello"});
});


/***************** Création de compte **************** */

// middleware that intercepts the register request and creates a new user
const register = () => {
  return (req, res, next) => {
    console.log("requête de création de compte reçue dans register :");
    console.log(req.body);

    var first_name = req.body.first_name;
    var last_name = req.body.last_name;
    var username = req.body.username;
    var email = req.body.email;
    var password;
    var userID;

    con.query("SELECT * FROM Student WHERE Username = '"+username+"' OR Email = '"+email+"'", function (err, result, fields) {
      if (err) throw err;
      if(result.length!=0){
        console.log("username or email already exists");
        res.status(401).json({"message" : "username or password already exists"});
      }
      else{
        //création de l'utilisateur avec mot de passe crypté
        bcrypt.genSalt(saltRounds, function (err, salt) {
          if (err) {
            throw err
          } else {
            bcrypt.hash(req.body.password, salt, function(err, hash) {
              if (err) {
                throw err
              } else {
                console.log(hash)
                //$2a$10$FEBywZh8u9M0Cec/0mWep.1kXrwKeiWDba6tdKvDfEBjyePJnDT7K
                con.query("INSERT INTO Student (Username,Password,Email,Name,Surname,Question1,Answer1,Question2,Answer2) VALUES ('"+username+"','"+hash+"','"+email+"','"+last_name+"','"+first_name+"','"+req.body.question1+"','"+req.body.answer1+"','"+req.body.question2+"','"+req.body.answer2+"')", function (err, result, fields){
                  if (err) {
                    throw err;
                  }
                  var userID = result.insertId;
                  const token = jwt.sign({ userID }, jwtKey, {algorithm: "HS256",expiresIn:'1h'});
                  res.status(200).json({"token" : token, "username" : username});
                });
              }
            })
          }
        });
      }
    });


  }}

// requête http POST pour se créer un compte
app.post('/register/', register(), (req, res) => {
  console.log("requête de création de compte reçue");
  console.log(req.body);
  res.status(200).json({"statusCode" : 200, "message" : "hello"});
});

// requête http GET pour se déconnecter
app.get('/logout/', (req, res) => {
  console.log("requête de déconnexion reçue")
  req.logout();
  res.redirect('/');
});

const isLoggedIn = (req, res, next) => {
if(req.isAuthenticated()){
  return next();
}
return res.status(400).json({"statusCode" : 400, "message" : "not authenticated"});
}

/***************************************************************************************************
 * ***************   Fin de Passport - Début des requêtes concernant les annonces  *****************
 * *************************************************************************************************/



// requête http POST pour ajouter une nouvelle annonce dans la DB
app.post('/addPost',tokenValidator,(req, res, next) => {
  console.log("requête de création d'annonce reçue :")
  //console.log(req.body);  //affiche les éléments de la requête

  var catID=[];
  for (let i=0; i< req.body.category.length; i++){
    var objet = req.body.category[i];
    catID[i] = attributeID(objet.toString()); //convertion de l'objet en string
  }

  var today = new Date(); //formater la date
  var dd = String(today.getDate()).padStart(2, '0');
  var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  var yyyy = today.getFullYear();

  today = yyyy + '-' + mm + '-' + dd;

  var titreEchape = addslashes(req.body.title); //échappe les caractères spéciaux, évite les erreurs dans la BD
  var descriptionEchape = addslashes(req.body.description);

  // con.query("SELECT StudentID FROM Student WHERE Username = '"+req.body.username+"'", function(err, result, fields){
  con.query("SELECT * FROM Student WHERE Username = '"+req.body.username+"'", function(err, result, fields){
    if(err) throw err;
    var studentPhoneNb = result.TelephoneNumber;
    var studentContact = result.Address;
    con.query("INSERT INTO Announce (Title, Price, Description, StudentID, PublicationDate, NbViews) VALUES ('"+titreEchape+"','"+req.body.price+"','"+descriptionEchape+"','"+result[0].StudentID+"','"+today+"', '"+0+"')",
    function (err, result, fields){
      if (err) throw err;
      console.log(result.insertId);
      var postID = result.insertId;
      res.status(201).json({message: 'objet créé', postID: postID, phoneNb: studentPhoneNb, contact: studentContact});
      for (let i=0; i<req.body.category.length; i++){
        console.log(6666),

        con.query("INSERT INTO AnnounceCategories (CategoryID, AnnounceID) VALUES ('"+catID[i]+"','"+result.insertId+"')",
          function (err, result, fields){
            if (err) throw err;
            console.log(result);
        });
      }
      console.log(9999999);
      for(let k= 0 ; k<req.body.urls.length ; k++){
        console.log(999);
        con.query("INSERT INTO Image (ImageString, AnnounceID) VALUES ('"+req.body.urls[k]+"','"+result.insertId+"')"),
          function(err,result, blabla){
            if(err){
              throw err;
            }else{
              console.log("HELLLLLLL");
              console.log(result);
            }
          }
      }
    });
    console.log(88);
  });
})


// requête http GET pour afficher une annonce spécifique
app.get('/getPost/:id', (req, res, next) => {
  console.log("id de l'annonce demandée : ", req.params.id);
  console.log("req.params :",req.params);
  con.query("SELECT * FROM Announce INNER JOIN Student ON Announce.StudentID = Student.StudentID INNER JOIN AnnounceCategories ON Announce.AnnounceID = AnnounceCategories.AnnounceID WHERE Announce.AnnounceID = '"+req.params.id+"'", function (err, result, fields) {
    if (err) throw err;
    var resultat=[];
    var categoryids=[];
    let j=0; //on travail avec deux pointeurs : i et j
    for (let i=0; i<result.length; i++){

      if (i==0){
        categoryids[0]=result[i].CategoryID;
        resultat[j]={"AnnounceID" : result[i].AnnounceID,
                   "Titre" : result[i].Title,
                   "Prix" : result[i].Price,
                   "Description" : result[i].Description,
                   "StudentID" : result[i].StudentID,
                   "DateDePublication" : result[i].PublicationDate,
                   "NombreDeVues" : result[i].NbViews,
                   "Username" : result[i].Username,
                   "NumTelephone" : result[i].TelephoneNumber,
                   "Image" : result[i].Image,
                   "Adresse" : result[i].Address,
                   "categoryids" : categoryids,
                 }
      }

      else{
        if (result[i].AnnounceID == result[i-1].AnnounceID){//si on a une deuxième même annonce pour une autre categorie
          resultat[j].categoryids.push(result[i].CategoryID)
        }
        else{
          j+=1;
          categoryids=[];
          categoryids[0]=result[i].CategoryID;
          resultat[j]={"AnnounceID" : result[i].AnnounceID,
                     "Titre" : result[i].Title,
                     "Prix" : result[i].Price,
                     "Description" : result[i].Description,
                     "StudentID" : result[i].StudentID,
                     "DateDePublication" : result[i].PublicationDate,
                     "NombreDeVues" : result[i].NbViews,
                     "Username" : result[i].Username,
                     "NumTelephone" : result[i].TelephoneNumber,
                     "Image" : result[i].Image,
                     "Adresse" : result[i].Address,
                     "categoryids" : categoryids,
                   }
        }
      }
    }
    for(let i=0; i<resultat.length; i++){
      resultat[i].categoryids = attributeCategory(resultat[i].categoryids);
    }
    res.status(200).json(resultat);
    console.log("resultat :", resultat);
  });
});

// requête http GET pour afficher toutes les annonces
app.get('/posts', (req, res, next) => {
  console.log("requête d'affichage de toutes les annonces reçue :")
  con.query("SELECT * FROM Announce INNER JOIN Student ON Announce.StudentID = Student.StudentID INNER JOIN AnnounceCategories ON Announce.AnnounceID = AnnounceCategories.AnnounceID ORDER BY Announce.AnnounceID", function (err, result, fields) {

    if (err) throw err;

    /*l'idée est de mettre l'info utilisable dans resultat si l'annonce d'avant n'a pas le meme announceID (ORDER BY important)
    si l'announce suivante a le meme numéro(mais elle aura un CatID différent), on ne rajoute pas l'annonce dans resultat mais on push dans le tableau
    de sa categorie le catID de l'annonce suivante. On a ainsi pas d'annonces en double et un tableau de catID correct*/
    var resultat=[];
    var categoryids=[];
    let j=0; //on travail avec deux pointeurs : i et j
    for (let i=0; i<result.length; i++){


      var urls = [];
      //for (let j=0; j<result[i])
      console.log(result[i].ImageString)

      if (i==0){
        categoryids[0]=result[i].CategoryID;
        resultat[j]={"AnnounceID" : result[i].AnnounceID,
                   "Titre" : result[i].Title,
                   "Prix" : result[i].Price,
                   "Description" : result[i].Description,
                   "StudentID" : result[i].StudentID,
                   "DateDePublication" : result[i].PublicationDate,
                   "NombreDeVues" : result[i].NbViews,
                   "urls":result[i].ImageString,
                   "Username" : result[i].Username,
                   "NumTelephone" : result[i].TelephoneNumber,
                   "Image" : result[i].Image,
                   "Adresse" : result[i].Address,
                   "categoryids" : categoryids,
                 }
      }

      else{
        if (result[i].AnnounceID == result[i-1].AnnounceID){//si on a une deuxième même annonce pour une autre categorie
          resultat[j].categoryids.push(result[i].CategoryID)
        }
        else{
          j+=1;
          categoryids=[];
          categoryids[0]=result[i].CategoryID;
          resultat[j]={"AnnounceID" : result[i].AnnounceID,
                     "Titre" : result[i].Title,
                     "Prix" : result[i].Price,
                     "Description" : result[i].Description,
                     "StudentID" : result[i].StudentID,
                     "DateDePublication" : result[i].PublicationDate,
                     "NombreDeVues" : result[i].NbViews,
                     "Username" : result[i].Username,
                     "NumTelephone" : result[i].TelephoneNumber,
                     "Image" : result[i].Image,
                     "Adresse" : result[i].Address,
                     "categoryids" : categoryids,
                   }
        }
      }
    }
    for(let i=0; i<resultat.length; i++){
      resultat[i].categoryids = attributeCategory(resultat[i].categoryids);
    }
    res.status(200).json(resultat);
    console.log("resultat :", resultat);
  });
});

// requête http POST pour faire une recherche par mot-clé
app.post('/search', (req, res, next) => {
  console.log("requête de recherche reçue :")
  console.log("mots-clé :");
  console.log(req.body.arg);
  var arg = req.body.arg.replace('\'', ' ');
  arg = arg.replace(',', ' ');
  arg = arg.replace(', ', ' ');
  arg = arg.replace('.', ' ');
  var split_regex = new RegExp('[ +()*/:?-]', 'g');
  var req_filt_str = arg.split(split_regex)
                      .filter(kw => kw.length > 2)
                      .map(kw => 'INSTR(Announce.Title,"' + kw + '") > 0 OR INSTR(Announce.Description,"' + kw + '") > 0')
                      .join(" OR ");
  if(req_filt_str == []){
    // res.status(401).json({"message" : "Filter with words with more than 2 letters"});
    res.status(200).json([]);
  } else {
    con.query("SELECT * FROM Announce INNER JOIN Student ON Announce.StudentID = Student.StudentID INNER JOIN AnnounceCategories ON Announce.AnnounceID = AnnounceCategories.AnnounceID WHERE "+req_filt_str, function(err,result){
      if(err) throw err;
      /*l'idée est de mettre l'info utilisable dans resultat si l'annonce d'avant n'a pas le meme announceID (ORDER BY important)
      si l'announce suivante a le meme numéro(mais elle aura un CatID différent), on ne rajoute pas l'annonce dans resultat mais on push dans le tableau
      de sa categorie le catID de l'annonce suivante. On a ainsi pas d'annonces en double et un tableau de catID correct*/
      var resultat=[];
      var categoryids=[];
      let j=0; //on travaille avec deux pointeurs : i et j
      for (let i=0; i<result.length; i++){
        if (i==0){
            categoryids[0]=result[i].CategoryID;
            resultat[j]={"AnnounceID" : result[i].AnnounceID,
                    "Titre" : result[i].Title,
                    "Prix" : result[i].Price,
                    "Description" : result[i].Description,
                    "StudentID" : result[i].StudentID,
                    "DateDePublication" : result[i].PublicationDate,
                    "NombreDeVues" : result[i].NbViews,
                    "Username" : result[i].Username,
                    "NumTelephone" : result[i].TelephoneNumber,
                    "Image" : result[i].Image,
                    "Adresse" : result[i].Address,
                    "categoryids" : categoryids,
            }
          }
        else {
          if (result[i].AnnounceID == result[i-1].AnnounceID){//si on a une deuxième même annonce pour une autre categorie
              resultat[j].categoryids.push(result[i].CategoryID)
          }
          else {
              j+=1;
              categoryids=[];
              categoryids[0]=result[i].CategoryID;
              resultat[j]={"AnnounceID" : result[i].AnnounceID,
                          "Titre" : result[i].Title,
                          "Prix" : result[i].Price,
                          "Description" : result[i].Description,
                          "StudentID" : result[i].StudentID,
                          "DateDePublication" : result[i].PublicationDate,
                          "NombreDeVues" : result[i].NbViews,
                          "Username" : result[i].Username,
                          "NumTelephone" : result[i].TelephoneNumber,
                          "Image" : result[i].Image,
                          "Adresse" : result[i].Address,
                          "categoryids" : categoryids,
                          }
          }
        }
      }
      for(let i=0; i<resultat.length; i++){
        resultat[i].categoryids = attributeCategory(resultat[i].categoryids);
      }
      res.status(200).json(resultat);
      console.log("resultat :", resultat);
    });
  }
  // });
});

app.post('/deletePost/', (req, res, next) => {
  console.log("requête pour supprimer une annonce reçue");
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  var userID = decodedToken.userID; // get userID from token payload
  con.query("SELECT StudentID FROM Announce WHERE AnnounceID = '"+req.body.postID+"'", function(err, result, fields) {
    if(err) throw err;
    if(userID == result[0].StudentID){ // vérifier que le username de l'en-tête http et de l'annonce sont identiques
      con.query("DELETE FROM AnnounceCategories WHERE AnnounceID = '"+req.body.postID+"'", function(err, result, fields) {
        if(err) throw err;
          con.query("DELETE FROM Announce WHERE AnnounceID = '"+req.body.postID+"'", function(err, result, fields) {
            if(err) throw err;
            res.status(200).json({"message" : "annonce supprimée"});
          })
      })
    }
  });
})

// requête http PATCH pour incrémenter le nombre de vues d'une annonce
app.patch('/incrview', (req, res, next) => {
  console.log("requête pour incrémenter le nombre de vues");
  console.log(req.get("Authorization"));
  if(req.get("Authorization")!=undefined){
    var encryptedToken = req.get("Authorization");  // get authorization token from http header
    var decodedToken = jwt.decode(encryptedToken); // decode token
    var userID = decodedToken.userID; // get userID from token payload
    con.query("UPDATE Announce SET NbViews = NbViews+1 WHERE AnnounceID = '"+req.body.id+"' AND StudentID !='"+userID+"'", function (err, result, fields) {
      if (err) throw err;
      console.log("annonce incrémentée");
      res.status(200).json({"message":"ok"});
    });
  }
  else{
    con.query("UPDATE Announce SET NbViews = NbViews+1 WHERE AnnounceID = '"+req.body.id+"'", function (err, result, fields) {
      if (err) throw err;
      console.log("annonce incrémentée");
      res.status(200).json({"message":"ok"});
    });
  }


});
app.get('/images',(req,res,nex)=>{
  var id = req.query.bid
  con.query("SELECT ImageString FROM Image WHERE AnnounceID = '"+id+"'",function(err,res,field){
    var urls = [];
    for(let k =0;k<res.length;k++){
      urls.push(res[k].ImageString)
    }
    console.log(urls.length);
    ress.status(200).json({[id]:urls});
  })
})


/***************************************************************************************************
* Fin des requêtes concernant les annonces - Début des requêtes concernant un profil d'utilisateur *
* *************************************************************************************************/

// requête pour récupérer toutes les infos d'un utilisateur
app.get('/getUserInfo', (req, res, next) => {
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  var userID = decodedToken.userID; // get userID from token payload
  console.log("Requête des infos d'utilisateur reçue.");
  console.log(userID);
  con.query("SELECT * FROM Student WHERE StudentID = '"+userID+"'", function (err, result, fields) {
    if (err) throw err;
    var tel = result[0].TelephoneNumber;
    if(tel==null){tel = ''}
    var contact = result[0].Address;
    if(contact==null){contact=''}
    var user = {"first_name" : result[0].Surname,
                "last_name" : result[0].Name,
                "username" : result[0].Username,
                "email" : result[0].Email,
                "phone_number" : tel,
                "contact_info" : contact
              }
    console.log("Envoi des données au front :");
    console.log(user);
    res.status(200).json(user);
  });
});

// requête pour vérifier si les infos de contact d'un utilisateur sont bien remplies
app.get('/checkUserContactInfo', (req, res, next) => {
  console.log("vérification des infos de contact");
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  var userID = decodedToken.userID; // get userID from token payload
  con.query("SELECT * FROM Student WHERE StudentID='"+userID+"'", function(err, result, fields){
    if(err) throw err;
    console.log(result);
    if((result[0].Address=='' || result[0].Address==null)
     && (result[0].TelephoneNumber=='' || result[0].TelephoneNumber==null)){
       console.log("false");
      res.status(400).json(false);
    }
    else{
      console.log("true");
      res.status(200).json(true);
    }
  })
})

// requête pour modifier des infos d'un utilisateur
app.post('/modifyUserInfo', (req, res, next) => {
  console.log("requête de modification des infos d'utilisateur reçue :");
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  var userID = decodedToken.userID; // get userID from token payload
  console.log("params:",req.body);

  //vérification que le username n'existe pas déjà
  con.query("SELECT * FROM Student WHERE Username='"+req.body.username+"'",function(err,result,fields){
    if(err) throw err;
    if (result.length !=0 && result[0].StudentID!=userID){ //si déjà présent, erreur
      console.log("username already exists")
      res.status(401).json({"message" : "username already exists"});
    } else { //sinon, mise à jour de la base de données
      con.query("UPDATE Student SET Username='"+req.body.username+"', Name='"+req.body.firstname+"', TelephoneNumber='"+req.body.phone+"', Address='"+req.body.other+"', Surname='"+req.body.lastname+"' WHERE StudentID='"+userID+"'",function (err, result, fields) {
        if (err) throw err;
        console.log("done");
        res.status(200).json({"Firstname":req.body.firstname,"Lastname":req.body.lastname,"Username":req.body.username,"Phone":req.body.phone,"Other":req.body.other});
      });
    }
  });
});

// requête pour récupérer toutes les annonces postées par un utilisateur
app.get('/getUserPosts', (req, res, next) => {
  console.log("requête pour les annonces d'un utilisateur reçue :");
   var encryptedToken = req.get("Authorization");  // get authorization token from http header
   var decodedToken = jwt.decode(encryptedToken); // decode token
   var userID = decodedToken.userID; // get userID from token payload

   con.query("SELECT * FROM Announce INNER JOIN Student ON Announce.StudentID = Student.StudentID INNER JOIN AnnounceCategories ON Announce.AnnounceID = AnnounceCategories.AnnounceID WHERE Announce.StudentID='"+userID+"' ORDER BY Announce.AnnounceID", function (err, result, fields) {
    if (err) throw err;
    //var data = JSON.stringify(result);
    var resultat=[];
    var categoryids=[];
    let j=0; //on travail avec deux pointeurs : i et j
    for (let i=0; i<result.length; i++){

      if (i==0){
        categoryids[0]=result[i].CategoryID;
        resultat[j]={"AnnounceID" : result[i].AnnounceID,
                   "Titre" : result[i].Title,
                   "Prix" : result[i].Price,
                   "Description" : result[i].Description,
                   "StudentID" : result[i].StudentID,
                   "DateDePublication" : result[i].PublicationDate,
                   "NombreDeVues" : result[i].NbViews,
                   "Username" : result[i].Username,
                   "NumTelephone" : result[i].TelephoneNumber,
                   "Image" : result[i].Image,
                   "Adresse" : result[i].Address,
                   "categoryids" : categoryids,
                 }
      }

      else{
        if (result[i].AnnounceID == result[i-1].AnnounceID){//si on a une deuxième même annonce pour une autre categorie
          resultat[j].categoryids.push(result[i].CategoryID)
        }
        else{
          j+=1;
          categoryids=[];
          categoryids[0]=result[i].CategoryID;
          resultat[j]={"AnnounceID" : result[i].AnnounceID,
                     "Titre" : result[i].Title,
                     "Prix" : result[i].Price,
                     "Description" : result[i].Description,
                     "StudentID" : result[i].StudentID,
                     "DateDePublication" : result[i].PublicationDate,
                     "NombreDeVues" : result[i].NbViews,
                     "Username" : result[i].Username,
                     "NumTelephone" : result[i].TelephoneNumber,
                     "Image" : result[i].Image,
                     "Adresse" : result[i].Address,
                     "categoryids" : categoryids,
                   }
        }
      }
    }
    for(let i=0; i<resultat.length; i++){
      resultat[i].categoryids = attributeCategory(resultat[i].categoryids);
    }
    res.status(200).json(resultat);
    console.log("resultat :", resultat);
    });
});

// requête pour supprimer un compte d'utilisateur
app.post('/deleteUserAccount', (req, res, next) => {
  console.log("requête pour supprimer un compte utilisateur reçue");
  console.log(req.headers);
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  console.log(decodedToken);
  var userID = decodedToken.userID; // get userID from token payload
  var password = req.body.password;
  console.log(userID);
  console.log(password);
  con.query("SELECT Password FROM Student where StudentID = '"+userID+"'", function (err, result, fields){
    if (err) {
      throw err;
    } else {
      /*var string = JSON.stringify(result); //convertit le result en JSON
      console.log(string);
      var json = JSON.parse(string); //sépare les éléments du JSON
      console.log(json);
      console.log("selection : ", json[0].Password);*/
      var motdepasse = result[0].Password;
      bcrypt.compare (password, motdepasse, function(err, isMatch){
        if (err) {
          throw err;
        } else if (!isMatch){
          console.log("The password doesn't match!");
          res.status(400).json({"statusCode" : 400, "message" : "incorrect password"});
          // return done("Incorrect Email/Password credentials", false);
        } else {
          console.log("Correct password");

          con.query("SELECT AnnounceID FROM Announce WHERE StudentID = '"+userID+"'", function(err,result,fields){
            if(err) throw err;
            console.log("annonces : ", result);
            for (let i=0; i<result.length; i++){
              con.query("DELETE FROM AnnounceCategories WHERE AnnounceID = '"+result[i].AnnounceID+"'", function(err,result,fields){
                if(err) throw err;
              });
            }
            con.query("DELETE FROM Announce WHERE StudentID = '"+userID+"'", function(err, result, fields){
              if(err) throw err;
              con.query("DELETE FROM Student WHERE StudentID = '"+userID+"'", function (err, result, fields){
                if(err) throw err;
                res.status(200).json({"message": "account was deleted"});
                console.log("account was deleted");
              });
            });
          });
        }
      })
    }
  });

});


//requête pour modifier le mot de passe
app.post('/modifyPassword', (req, res,next) =>{
  console.log("requête pour changer le password d'un utilisateur reçue :");
  var encryptedToken = req.get("Authorization");  // get authorization token from http header
  var decodedToken = jwt.decode(encryptedToken); // decode token
  var userID = decodedToken.userID; // get userID from token payload

  con.query("SELECT Password FROM Student where StudentID = '"+userID+ "'",function (err, result, fields) {
      if (err) {
          throw err;
      } else {
          var password = result[0].Password;
          bcrypt.compare (req.body.oldPassword, password, function(err, isMatch){
              if (err) {
                  throw err;
              } else if (!isMatch){
                  console.log("The password doesn't match!");
                  res.status(401).json({"message" : "Incorrect Password"});
              } else {
                  console.log("Correct password");
                  bcrypt.genSalt(saltRounds, function (err, salt) {
                      if (err) {
                          throw err
                      } else {
                          bcrypt.hash(req.body.newPassword, salt, function(err, hash) {
                              if (err) {
                                  throw err
                              } else {
                                  console.log(hash)
                                  con.query("UPDATE Student SET Password='"+hash+"' WHERE StudentID = '"+userID+"'", function (err, result, fields) {
                                      if(err){
                                          throw err;
                                      }
                                      res.status(200).json({"message": "Password successfully changed"});
                                  });
                              }
                          })
                      }
                  });
              }
          });
      }
  });
});


app.use((req, res, next) => {
 res.json({message:'Insatroc'});
});

module.exports = app;
