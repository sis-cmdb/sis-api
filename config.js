
// templatize this for the env
module.exports =
{
    db: {
        url : "mongodb://localhost/sis",
        opts : {
                maxPoolSize: 5,
                writeConcern: {w: 1, j: true}
            }
    },
    server : {
        port : 3000
    },
    app : {
        auth : true,
        auth_config : {
            type : 'sis'
        },
        scripts_enabled : false
    }
};

module.exports.app.auth_config = {"url": "ldaps://10.171.149.94", "client_opts": {"tlsOptions": {"rejectUnauthorized": false}}, "user_domain": "vcorp.ad.vrsn.com", "type": "ldap", "email_domain": "verisign.com"};
