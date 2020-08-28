const express = require('express');
var request = require('request'); // "Request" library
var cors = require('cors');
mysql = require('mysql2');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

const my_client_id = '';
const my_client_secret = '';
const my_callback_link = 'http://localhost:3001/callback';
const MY_USER = '';
const MY_PASSWORD = '';
const MY_BASE = '';


var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

const app = express(); 


app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/auth', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: my_client_id,
      scope: scope,
      redirect_uri: my_callback_link,
      state: state
    }));
});

app.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter
  
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;
    if (state === null || state !== storedState) {
      res.redirect('/#' +
        querystring.stringify({
          error: 'state_mismatch'
        }));
    } else {
      res.clearCookie(stateKey);
      var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        form: {
          code: code,
          redirect_uri: my_callback_link,
          grant_type: 'authorization_code'
        },
        headers: {
          'Authorization': 'Basic ' + (new Buffer(my_client_id + ':' + my_client_secret).toString('base64'))
        },
        json: true
      };
  
      request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
  
          var access_token = body.access_token,
              refresh_token = body.refresh_token;
              var accessToken = "token";
              res.cookie(accessToken, access_token);
              res.cookie("isLogged", true);
  
          var options = {
            url: 'https://api.spotify.com/v1/me',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
          };
          res.redirect('http://localhost:3000/');
        } 
        else {
          res.redirect('/#' +
            querystring.stringify({
              error: 'invalid_token'
            }));
        }
      });
    }
});
  
app.get('/refresh_token', function(req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: { 'Authorization': 'Basic ' + (new Buffer(my_client_id + ':' +my_client_secret).toString('base64')) },
      form: {
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      },
      json: true
    };
  
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token;
        res.send({
          'access_token': access_token
        });
      }
    });
});
app.get('/artist_search',function (req,res) {
    var resbody = '';
    var name = req.query.name;
    let exists;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (new Buffer(my_client_id + ':' +my_client_secret).toString('base64'))},
        form: {
            grant_type: 'client_credentials',
        },
        json: true
    };
    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var token = body.access_token;
            var options = {
                url: 'https://api.spotify.com/v1/search',
                headers: { 'Authorization': 'Bearer ' + token },
                qs: {
                    q: name,
                    type: 'artist'
                },
            };
            request.get(options,function (error,response,body) {
                let jso = JSON.parse(body).artists.items;
                let id = jso[0].id;
                let data = {};
                options.url = 'https://api.spotify.com/v1/artists/'+id;
                options.qs='';
                request.get(options,function (error,response,body){
                    let data1 = JSON.parse(body)
                    data.image = data1.images[0].url;
                    data.name = data1.name;
                    data.popularity = data1.popularity;
                    options.url += '/top-tracks';
                    options.qs = {country:"RU"}
                    request.get(options,function (error,response,body){
                        let data2 = body;
                        let tracks = JSON.parse(data2).tracks;
                        let topTracks = [];
                        tracks.forEach((track)=>{
                            topTracks.push(track.name);
                        });
                        data.topTracks = topTracks;
                        options.url = 'https://api.spotify.com/v1/artists/'+ id + '/related-artists';
                        options.qs = '';
                        request.get(options,function (error,response,body){
                            let related= JSON.parse(body).artists;
                            let relatedArtists =[];
                            related.forEach((artist) =>{relatedArtists.push(artist.name);});
                            data.related = relatedArtists;
                            const connection = mysql.createConnection({
                                host: 'localhost',
                                user: MY_USER,
                                database: MY_BASE,
                                password: MY_PASSWORD
                            }).promise();
                            const rName = 'SELECT * FROM artists WHERE name=? LIMIT 1;';
                            const rNameData = [data.name];

                            connection.query(rName,rNameData)
                                .then(([rows,fields])=>{
                                    if(rows[0]){
                                        let rData =[
                                            data.image,
                                            data.popularity,
                                            JSON.stringify(data.topTracks),
                                            JSON.stringify(data.related),
                                            data.name
                                        ];
                                        let querySql = 'UPDATE artists SET ' +
                                            'popularity = ?,' +
                                            'image = ?,' +
                                            'tracks = ?,' +
                                            'related = ? ' +
                                            'WHERE name = ?;';
                                        connection.query(querySql,rData).catch((error)=> {console.log(error)});
                                    }
                                    else{
                                        let rData = [
                                            data.name,
                                            data.popularity,
                                            data.image,
                                            JSON.stringify(data.topTracks),
                                            JSON.stringify(data.related)
                                        ];
                                        let querySql = 'INSERT INTO artists (name,popularity,image,tracks,related) VALUES(?,?,?,?,?);';
                                        connection.query(querySql,rData).catch((error)=> {console.log(error)});
                                    }
                                })
                                .catch((error) => {console.log(error);});
                            res.send(JSON.stringify(data));
                        });
                    });
                });
            });
        }
    });
});
    

app.listen(3001);