// File : index.js
// Author : Kevin Lessard

// This file opens a local server and starts the markov.js file to generate text


'use strict';

var http = require("http");
var fs = require('fs');
var urlParse = require('url').parse;
var pathParse = require('path').parse;
var querystring = require('querystring');
var crypto = require('crypto');
var request = require('sync-request');
var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

// Votre librairie est incluse ici
var markov = require('./markov.js');

// Fonctions exportées
var creerModele = markov.creerModele;
var genererParagraphes = markov.genererParagraphes;

// Liste de premières phrases possibles pour les articles
// Ajoutez-en si vous avez des idées!
var premieresPhrases = [
    "<strong>{{titre}}</strong> est un animal aquatique nocturne.",
    "<strong>{{titre}}</strong> (du grec ancien <em>\"{{titre-1}}\"</em> et <em>\"{{titre-2}}\"</em>), est le nom donné par Aristote à la vertu politique.",
    "<strong>{{titre}}</strong>, né le 30 août 1987 à Portland (Oregon), est un scénariste américain.",
    "<strong>{{titre}}</strong>, née le 30 septembre 1982 à Québec, est une femme politique québécoise.",
    "<strong>{{titre}}</strong> est défini comme « l'ensemble des règles imposées aux membres d'une société pour que leurs rapports sociaux échappent à l'arbitraire et à la violence des individus et soient conformes à l'éthique dominante ».",
    "<strong>{{titre}}</strong>, néologisme du XXe siècle, attesté en 1960, composite du grec ancien <em>{{titre-1}}</em> et du latin <em>{{titre-2}}</em>, est le principe déclencheur d'événements non liés à une cause connue.",
    "<strong>{{titre}}</strong> est une espèce fossile d'euryptérides ressemblant aux arachnides, appartenant à la famille des <em>{{titre-1}}</em>.",
    "<strong>{{titre}}</strong>, né le 25 juin 1805 à Lyon et mort le 12 février 1870 à Versailles, est un peintre animalier français.",
    "<strong>{{titre}}</strong> est le titre d'un épisode de la série télévisée d'animation Les Simpson. Il s'agit du quatre-vingt-dix-neuvième épisode de la soixante-huitième saison et du 8 615e épisode de la série.",
    "<strong>{{titre}}</strong>, composé de <em>{{titre-1}}</em>- et de -<em>{{titre-2}}</em>, consiste en l'étude d'une langue et de sa littérature à partir de documents écrits."
];

// --- Utilitaires ---
var readFile = function (path, binary) {
    if (!binary)
        return fs.readFileSync(path).toString('utf8');
    return fs.readFileSync(path, { encoding: 'binary' });
};

var writeFile = function (path, texte) {
    fs.writeFileSync(path, texte);
};

// ---------------------------------------------------------
//  Fonctions pour communiquer avec Wikipédia
//  (trouver des articles au hasard et extraire des images)
// ---------------------------------------------------------

/*
 * Requête *synchrone* pour obtenir du JSON depuis un API
 * quelconque.
 *
 * NOTEZ : ce code fait l'affaire pour ce TP, mais ne serait pas
 * acceptable dans un vrai serveur web. Pour simplifier le travail à
 * faire dans ce TP, on va néanmoins utiliser cette approximation, qui
 * serait beaucoup trop lente à exécuter sur un vrai site pour ne pas
 * que le site "laggue".
 */
var jsonRequestSync = function (url) {
    try {
        var response = request('GET', url);
    } catch (e) {
        return false;
    }

    if (response.statusCode != '200') {
        console.error(new Error("Page web invalide").stack);
        return false;
    }

    try {
        return JSON.parse(response.body.toString());
    } catch (e) {
        console.error(new Error("Page web invalide").stack);
    }
};

/*
 * Retourne un tableau contenant `n` titres de pages au hasard de
 * Wikipédia français
 */
var getRandomPageTitles = function (n) {
    var req = jsonRequestSync('https://fr.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=' + n + '&format=json');

    if (!req) {
        return Array(n).fill("Pas d'internet");
    }

    return req.query.random.map(function (x) {
        return x.title;
    });
};

var md5 = function (data) {
    return crypto.createHash('md5').update(data).digest("hex");
};

/*
 * Découpe le nom de fichier donné par Wikipédia pour l'image et
 * retourne son URL
 */
var fileUrl = function (wikipediaName) {
    var filename = wikipediaName.slice('Fichier:'.length).split(' ').join('_');

    var hash = md5(filename).slice(0, 2);

    return "https://upload.wikimedia.org/wikipedia/commons/" + hash[0] + '/' + hash + '/' + filename;
};

/*
 * Retourne l'URL de la première image de l'article Wikipédia dont le
 * titre est title.
 */
var getPageFirstImage = function (title) {
    var encodedTitle = encodeURIComponent(title);

    var pageUrl = "https://fr.wikipedia.org/w/api.php?action=query&titles=" +
        encodedTitle + "&format=json&prop=images&imlimit=30";

    var req = jsonRequestSync(pageUrl);

    if (!req) {
        return undefined;
    }

    var pages = req.query.pages;

    if (typeof (pages[-1]) === "undefined") {
        var page = Object.values(pages)[0];

        if (typeof (page.images) === 'undefined') {
            return false;
        }

        var images = page.images.map(function (img) {
            return img.title;
        });

        images = images.filter(function (x) {
            var parts = x.split('.');
            return ['jpg', 'png', 'jpeg', 'gif'].indexOf(parts[parts.length - 1]) !== -1;
        });

        if (images.length > 0)
            return images[0];
    }

    return false;
};

/*
 * Retourne une image de Wikipédia Français pour l'article nommé
 * title. Si l'article existe, et comporte des images, cette fonction
 * retourne la première image de l'article (selon l'ordre retourné par
 * l'API de Wikipédia), sinon cette fonction trouve une image au
 * hasard.
 */
var getImage = function (title) {

    var img = false;
    var url;
    do {

        if (typeof (title) !== 'undefined') {
            // 1. Vérifier si la page Wikipédia de "title" existe
            img = getPageFirstImage(title);
        }

        if (!img) {
            do {
                // 2. Lister 10 articles au hasard de Wikipédia
                var randomPages = getRandomPageTitles(10);

                for (var i = 0; i < randomPages.length; i++) {
                    img = getPageFirstImage(randomPages[i]);
                    if (img !== false) {
                        break;
                    }
                }
            } while (img === false);
        }

        if (img === undefined) {
            // Pas d'internet
            return '/no-internet.png';
        }

        url = fileUrl(img);

        title = undefined;
        img = false;

        try {
            var response = request('HEAD', url);

            // Image trop petite, on en trouve une autre
            if (response.headers['content-length'] < 30000) {
                response = false;
                continue;
            }
        } catch (e) {
            continue;
        }

    } while (!response || response.statusCode != '200');

    return url;
};

// --------------------
//  Gestion du serveur
// --------------------
var port = 1337;
var hostUrl = 'http://localhost:' + port + '/';
var defaultPage = '/index.html';

var mimes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
};

// --- Server handler ---
var redirect = function (reponse, path, query) {
    var newLocation = path + (query == null ? '' : '?' + query);
    reponse.writeHeader(302, { 'Location': newLocation });
    reponse.end('302 page déplacée');
};

var getDocument = function (url) {
    var pathname = url.pathname;
    var parsedPath = pathParse(url.pathname);
    var result = { data: null, status: 200, type: null };

    if (Object.keys(mimes).indexOf(parsedPath.ext) != -1) {
        result.type = mimes[parsedPath.ext];
    } else {
        result.type = 'text/plain';
    }

    try {
        if (['.png', '.jpg'].indexOf(parsedPath.ext) !== -1) {
            result.data = readFile('./public' + pathname, { encoding: 'binary' });
            result.encoding = 'binary';
        } else {
            result.data = readFile('./public' + pathname);
        }
        console.log('[' + new Date().toLocaleString('iso') + "] GET " + url.path);
    } catch (e) {
        // File not found.
        console.log('[' + new Date().toLocaleString('iso') + "] GET " +
            url.path + ' not found');
        result.data = readFile('template/error404.html');
        result.type = 'text/html';
        result.status = 404;
    }

    return result;
};

var sendPage = function (reponse, page) {
    reponse.writeHeader(page.status, { 'Content-Type': page.type });
    reponse.end(page.data, page.encoding || 'utf8');
};

// le modèle du corpus choisi.
var modeleFinal = markov.creerModele(readFile("corpus/wikipedia"));

// fonction change une certaine étiquette par la valeur souhaitée, si c'est une
// étiquette quelconque, de base en encode pour que html comprenne.
var substituerEtiquette = function (texte, etiquette, valeur) {
    if (etiquette == "{{{articles-recents}}}" || etiquette ==
        "{{{contenu}}}") {
        while (texte.includes(etiquette)) {
            texte = texte.replace(etiquette, valeur);
        }
    } else {
        while (texte.includes(etiquette)) {
            texte = texte.replace(etiquette, entities.encode(valeur));
        }
    }
    return texte;
};

// fonction qui retourne le contenu de la page d'accueil avec les substitions
// des articles récents et de l'image aléatoire
var getIndex = function () {

    var docIndex = readFile("./template/index.html");
    var tabContenu = getRandomPageTitles(20);

    tabContenu = tabContenu.map(function (articleName) {
        return "<li>\n<a href=\"article/" + articleName + "\">" + articleName +
            "</a>\n</li>";
    }).join("\n");

    docIndex =
        substituerEtiquette(docIndex, "{{{articles-recents}}}", tabContenu);
    docIndex = substituerEtiquette(docIndex, "{{img}}", getImage());
    return docIndex;
};

// sépare le titre en deux à partir du milieu pour tous les types de titres
// et dans le cas impair, met le plus petit morceau à gauche.
var separerTitre = function (titre) {
    var milieu = Math.floor(titre.length / 2);
    return [titre.slice(0, milieu), titre.slice(milieu)];
};

/* mets aléatoirement certains longs mots du contenu généré entre cdes balises
   html pour mettre en gras, en italique ou en lien. Retourne un tableau de
   paragraphe */
var aleatoire = function (contenu) {
    contenu = contenu.map(function (paragraphe) {
        var paragrapheFinal = [];
        var debut = 0;
        for (var j = 0; j <= paragraphe.length; j++) {
            if (paragraphe.charAt(j) == " ") {
                var motTemp = paragraphe.slice(debut, j);
                debut = j + 1;
                var correct = 0;
                for (var i = 0; i < motTemp.length; i++) {
                    var char = motTemp[i];
                    if ((char >= "a" && char <= "z") ||
                        (char >= "A" && char <= "Z")) {
                        correct += 1;
                    }
                }
                if (correct == motTemp.length && motTemp.length >= 7) {
                    var random = Math.floor(Math.random() * 100);
                    if (random <= 15) {
                        motTemp = "<strong>" + motTemp + "</strong>";
                    }
                    if (random > 15 && random <= 30) {
                        motTemp = "<em>" + motTemp + "</em>";
                    }
                    if (random > 30 && random <= 45) {
                        motTemp = "<a href=\"article/" + motTemp + "\">" +
                            motTemp + "</a>";
                    }
                }
                paragrapheFinal.push(motTemp);
            }
        }
        return paragrapheFinal.join(" ");
    });
    return contenu;
};

// génère à partir d'un barème une page avec un certain titre donnée une page
// HTML avec du contenu aléatoire et si possible un image lié au titre donnée
var getArticle = function (titre) {

    var docArticle = readFile("./template/article.html");
    var premierPar = [premieresPhrases[Math.floor(Math.random() * 10)]];

    var nbParagraphes = 12 - Math.ceil(Math.random() * 5);
    var nbPhrases = 25 - Math.ceil(Math.random() * 20);
    var nbMots = 40 - Math.ceil(Math.random() * 25);

    var contenu = markov.genererParagraphes(modeleFinal, nbParagraphes,
        nbPhrases, nbMots);
    contenu = premierPar.concat(contenu);
    contenu = aleatoire(contenu);
    contenu = contenu.map(function (paragraphe) {
        return "<p>\n" + paragraphe + "\n</p>";
    }).join("");

    var morceauxTitre = separerTitre(titre);
    var titreUn = morceauxTitre[0];
    var titreDeux = morceauxTitre[1];

    // change toutes les étiquettes possibles dans article.html
    docArticle = substituerEtiquette(docArticle, "{{{contenu}}}", contenu);
    docArticle = substituerEtiquette(docArticle, "{{titre}}", titre);
    docArticle = substituerEtiquette(docArticle, "{{titre-1}}", titreUn);
    docArticle = substituerEtiquette(docArticle, "{{titre-2}}", titreDeux);
    docArticle = substituerEtiquette(docArticle, "{{img}}", getImage(titre));
    return docArticle;

};

var tests = function () {

    // tests fonction substituerEtiquette
    var texteTest1 = "Bonjour : {{{test}}}!";
    var texteTest2 = "Bonjour : {{{contenu}}}!";
    console.assert(substituerEtiquette(texteTest1, "{{{test}}}", "toi") ==
        "Bonjour : toi!");
    console.assert(substituerEtiquette(texteTest1, "{{{test}}}", "") ==
        "Bonjour : !");
    console.assert(substituerEtiquette(texteTest1, "{{{test}}}", "3 > 5") ==
        "Bonjour : 3 &gt; 5!");
    console.assert(substituerEtiquette(texteTest2, "{{{contenu}}}", "3 > 5") ==
        "Bonjour : 3 > 5!");
    console.assert(substituerEtiquette(texteTest1, "{{{test}}}", "\"allo\"") ==
        "Bonjour : &quot;allo&quot;!");
    console.assert(substituerEtiquette(texteTest2, "{{{contenu}}}", "\"allo\"") ==
        "Bonjour : \"allo\"!");

    // tests fonction separerTitre
    console.assert(separerTitre("Programmation") == ["Progra", "mmation"] + "");
    console.assert(separerTitre("La mère à boire!") == ["La mère ", "à boire!"] + "");
    console.assert(separerTitre("Le papa, le pipi, le popo,...") ==
        ["Le papa, le pi", "pi, le popo,..."] + "");
    console.assert(separerTitre("") == ["", ""] + "");
    console.assert(separerTitre("F") == ["", "F"] + "");

};

tests();

// Création du serveur HTTP
http.createServer(function (requete, reponse) {
    var url = urlParse(requete.url);

    // Redirect to index.html
    if (url.pathname == '/') {
        redirect(reponse, defaultPage);
        return;
    }

    var doc;

    if (url.pathname == defaultPage) {
        // Index
        doc = { status: 200, data: getIndex(), type: 'text/html' };
    } else if (url.pathname == '/random') {
        // Page au hasard
        redirect(reponse, '/article/' +
            encodeURIComponent(getRandomPageTitles(1)[0]));
        return;
    } else {
        var parsedPath = pathParse(url.pathname);

        if (parsedPath.dir == '/article') {
            var title;

            try {
                title = decodeURIComponent(parsedPath.base);
            } catch (e) {
                title = parsedPath.base.split('%20').join(' ');
            }

            // Force les articles à commencer avec une majuscule si c'est une 
            // lettre
            var capital = title.charAt(0).toUpperCase() + title.slice(1);
            if (capital != title) {
                redirect(reponse, encodeURIComponent(capital));
                return;
            }

            doc = { status: 200, data: getArticle(title), type: 'text/html' };
        } else {
            doc = getDocument(url);
        }
    }

    sendPage(reponse, doc);
}).listen(port);
