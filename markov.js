// File : index.js
// Author : Kevin Lessard

// This file contains the code of the markov chain that generates sentences.


// Utilitaires pour manipuler des fichiers
var fs = require("fs");

var readFile = function (path) {
    return fs.readFileSync(path).toString();
};

var writeFile = function (path, texte) {
    fs.writeFileSync(path, texte);
};

//ajoute une espace après un mot qui se termine par un "."
function addSpace(tab) {
    for (var i = 0; i < tab.length; i++) {
        if (tab[i].charAt(tab[i].length - 1) == ".") {
            tab = tab.slice(0, i + 1).concat("").concat(tab.slice(i + 1));
        }
    }
    return tab;
}

//crée un dictionnaire qui contient tous les mots en ordre avec répétitions
function creerDictionnaire(texte) {

    //on split sur les \n et les espaces
    texte = texte.split(" ");

    texte = texte.map(function (x) {
        return x.split("\n");
    });

    //on ajoute les espaces après les "."
    texte = texte.map(function (x) {
        return addSpace(x);
    });

    return texte;
}

//enlève les répétitions d'un dictionnaire
function reduceDict(dictionnaire) {
    var redDict = [];
    dictionnaire.map(function (x) {
        redDict.includes(x) ? null : redDict = redDict.concat(x);
    });
    return redDict;
}

//divise la probabilité par le nombre d'éléments dans la catégorie
function divProb(prochainsMots) {
    prochainsMots.map(function (x, i) {
        prochainsMots[i].map(function (y, j) {
            prochainsMots[i][j].prob = y.prob / x.length;
        });
    });
    return prochainsMots;
}

//fonction principale qui crée un modèle de dictionnaire et de prochains mots
var creerModele = function (texte) {

    //**section dictionnaire**

    //on crée un dictionnaire temporaire pour la prochaine étape
    //ce dictionnaire contient tous les mots du texte avec répétitions
    texte = creerDictionnaire(texte);

    //on renomme texte en tempDict, on ajoute une chaine vide au début
    //ça devient un seul tableau de mots à la place d'un tableau de tableaux
    var tempDict = [""];
    texte.map(function (x) {
        tempDict = tempDict.concat(x);
    });

    //tempDict sera utilisé comme référence et dictionnaire sera modifié
    var dictionnaire = tempDict;

    //réduction du dictionnaire final en ordre d'apparition sans répétitions
    dictionnaire = reduceDict(dictionnaire);

    //**section prochainsMots**

    //tableau de tableaux vide
    var prochainsMots = Array(dictionnaire.length).fill([]);

    //on refait le tableau sinon push met la valeur dans toutes les cases
    prochainsMots = prochainsMots.map(function (x) {
        return [];
    });

    //on met chaque "mot suivant" dans sa catégorie avec une prob 1
    tempDict.map(function (x, i) {
        if (i != tempDict.length - 1) {
            dictionnaire.map(function (y, j) {
                //si c'est la fin d'une phrase on met rien
                if (x == y && tempDict[i + 1] != "") {
                    prochainsMots[j].push({ mot: tempDict[i + 1], prob: 1 });
                }
            });
        }
    });

    //on divise la probabilité par le nombre d'éléments dans la catégorie
    prochainsMots = divProb(prochainsMots);

    //on supprime les mots pareils et on ajuste les prob en conséquence
    dictionnaire.map(function (x, i) {
        prochainsMots[i].map(function (y, j) {
            if (j < prochainsMots[i].length - 1) {
                prochainsMots[i].map(function (z, k) {
                    if (y.mot == z.mot && j != k && k > j) {
                        //si on trouve les mêmes mot dans une catégorie
                        //additionne leurs probabilités et delete les copies
                        prochainsMots[i][j].prob += prochainsMots[i][k].prob;
                        prochainsMots[i].splice(k, 1);
                    }
                });
            }
        });
    });

    //modèle final
    var modele = {
        dictionnaire: dictionnaire,
        prochainsMots: prochainsMots,
    };

    return modele;
};

/*trouve le prochain mot en fonction d'une catégorie,
d'un nombre aléatoire et d'un index qui incrémente
jusqu'à ce qu'on arrive au mot qui correspond au nombre aléatoire*/
function prochainMot(categorie, num, i) {

    //vide reste vide
    if (categorie == [] + "") {
        return "";
    } else if (num <= categorie[i].prob) {
        //si le mot correspond à la probabilité, on le choisit
        return categorie[i].mot;
    } else {
        //sinon on soustrait la "prob" du mot à la probabilité et on continue
        return prochainMot(categorie, num - categorie[i].prob, i + 1);
    }
}

//génère aléatoirement le prochain mot
var genererProchainMot = function (modele, motActuel) {

    //variables du modèle
    var dictionnaire = modele.dictionnaire;
    var prochainsMots = modele.prochainsMots;

    //possibilitées pour le prochain mot
    var index = dictionnaire.indexOf(motActuel);
    var prochainsMotsPossibles = prochainsMots[index];

    //choix aléatoire du prochain mot parmis les mots possibles
    return prochainMot(prochainsMotsPossibles, Math.random(), 0);
};

//génère une phrase
var genererPhrase = function (modele, maxNbMots) {

    //La phrase doit commencer par une chaine vide
    var phrase = [""];
    for (var i = 0; i < maxNbMots; i++) {
        //prochain mot à ajouter
        var prochain = genererProchainMot(modele, phrase[phrase.length - 1]);
        //si le mot se termine par un ".", on termine la phrase
        if (prochain.charAt(prochain.length - 1) == ".") {
            phrase.push(prochain);
            i = maxNbMots;
            continue;
        } else if (maxNbMots - i == 1) {
            //on ajoute un "." si c'est le dernier mot
            phrase.push(prochain + ".");
            i = maxNbMots;
            continue;
        } else { //sinon on continue la phrase
            phrase.push(prochain);
        }
    }

    //on enlève la chaine vide au début de la phrase
    phrase.shift();
    return phrase.join(" ");
};

//génère un paragraphe
function genererParagraphes(modele, nbParagraphes, maxNbPhrases, maxNbMots) {
    var allParagraphe = [];
    for (var i = 0; i < nbParagraphes; i++) {
        var paragraphe = [];
        //nombre aléatoire de phrases entre 1 et maxNbPhrases
        for (var j = 0; j < Math.ceil(Math.random() * maxNbPhrases); j++) {
            paragraphe.push(genererPhrase(modele, maxNbMots) + " ");
        }
        //saut de ligne entre les paragraphes
        paragraphe = paragraphe.join("");
        allParagraphe.push(paragraphe);
    }
    return allParagraphe;
}

var tests = function () {

    console.assert(addSpace(["A", "B.", "C", "A."]) ==
        ["A", "B.", "", "C", "A.", ""] + "");
    console.assert(addSpace([]) == [] + "");
    console.assert(addSpace(["a", "b"]) == ["a", "b"] + "");
    console.assert(creerDictionnaire("Salut je fais. Un\nprogramme.") ==
        [["Salut"], ["je"], ["fais.", "", "Un"], ["programme.", ""]] + "");
    console.assert(creerDictionnaire("") == [] + "");
    console.assert(creerDictionnaire("\n") == [["", ""]] + "");
    console.assert(reduceDict(["", "A", "A.", "C", "A", ""]) ==
        ["", "A", "A.", "C"] + "");
    console.assert(reduceDict([]) == [] + "");
    console.assert(reduceDict([".", ".", "..", ".", "."]) == [".", ".."] + "");
    console.assert(divProb(
        [[{ mot: 'A', prob: 1 }, { mot: 'A', prob: 1 },
        { mot: 'B', prob: 1 }, { mot: 'C', prob: 1 }]]) ==
        [[{ mot: 'A', prob: 0.25 }, { mot: 'A', prob: 0.25 },
        { mot: 'B', prob: 0.25 }, { mot: 'C', prob: 0.25 }]] + "");
    console.assert(divProb([[]]) == [[]] + "");
    console.assert(divProb([[{ mot: 'A', prob: 1 }]]) ==
        [[{ mot: 'A', prob: 1 }]] + "");

    //les tests de creermodele requierent des variables préalables
    //elles seront réutiliées pour les test de genererProchainMot
    var corpusTest = readFile('corpus/trivial');
    var modeleTest = creerModele(corpusTest);
    console.assert(modeleTest.dictionnaire ==
        ['', 'A', 'B', 'C.', 'A.', 'C'] + "");
    console.assert(modeleTest.prochainsMots == [
        [
            { mot: 'A', prob: 0.6666666666666666 },
            { mot: 'C', prob: 0.3333333333333333 }
        ],
        [{ mot: 'B', prob: 1 }],
        [
            { mot: 'C.', prob: 0.3333333333333333 },
            { mot: 'A.', prob: 0.6666666666666666 }
        ],
        [],
        [],
        [{ mot: 'B', prob: 1 }]
    ] + "");
    console.assert(creerModele("") ==
        { dictionnaire: [''], prochainsMots: [[]] } + "");
    console.assert(prochainMot([{ mot: 'B', prob: 1 }], 0.5, 0) == "B");
    //mot 0, chiffre 0.7, prob 0.5, 0.7 > 0,5 -> on passe au prochain
    console.assert(prochainMot([{ mot: 'C.', prob: 0.5 },
    { mot: 'A.', prob: 0.5 }], 0.7, 0) == "A.");
    //mot 1, chiffre 0.2, prob 0.5 -> on choisit ce mot
    console.assert(prochainMot([{ mot: 'C.', prob: 0.5 },
    { mot: 'A.', prob: 0.5 }], 0.2, 1) == "A.");
    console.assert(prochainMot([], 1, 0) == "");
    //après un ".", on a toujours un " "
    //modele de corpus/trivial
    console.assert(genererProchainMot(modeleTest, "C.") == "");
    //"B" vient 100% du temps après dans cet exemple
    console.assert(genererProchainMot(modeleTest, "A") == "B");
    //dans un modèle vide le seul prochain mot possible est le vide
    console.assert(genererProchainMot(
        { dictionnaire: [''], prochainsMots: [[]] }, "") == "");
};

if (require.main === module) {
    // Si on se trouve ici, alors le fichier est exécuté via : nodejs markov.js
    tests(); // On lance les tests
} else {
    /* Sinon, le fichier est inclus depuis index.js
       On exporte les fonctions importantes pour le serveur web */
    exports.creerModele = creerModele;
    exports.genererParagraphes = genererParagraphes;
}
