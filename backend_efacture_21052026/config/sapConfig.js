// Exporter une fonction qui prend les paramètres ashost et user


module.exports = async function getSapConfig(user,password) {
    return {
        ashost: "10.10.2.42",//prod
        //ashost: "10.10.2.40", //DNO
        /* ashost: "10.200.200.222",//clone */
        sysnr: "00", // Numéro de système SAP
        client: "100", // Numéro de client
        //user: user, // Nom d'utilisateur SAP
        //passwd: password, // Mot de passe SAP
        user: 'SYSAUTO',//sateur SAP
        passwd: 'armaguedon', // Mot de passe SAP
        language: "FR",
        lang: "FR",
    };
  };


/*
module.exports = async function getSapConfig(user,password) {
    return {
        //ashost: "10.10.2.42",//prod
        ashost: "10.10.2.40", //DNO
        //ashost: "10.200.200.200",//clone
        sysnr: "00", // Numéro de système SAP
        client: "100", // Numéro de client
        //user: user, // Nom d'utilisateur SAP
        //passwd: password, // Mot de passe SAP
        user: 'GIMAD', // Utilisateur SAP
        passwd: '2024@basis', // Mot de passe SAP
        language: "FR",
        lang: "FR",
    };
};
*/
