const models = require('../models');
const errors = require('./errors');
const Promise = require('promise');
const requestp = require('request-promise');
const config = require('../config.json');

// Permission codes -- in order of decreasing access rights
const PERMISSION_OWNER = 1;
const PERMISSION_READ_WRITE = 2;
const PERMISSION_READ_ONLY = 3;
const PERMISSION_NONE = 4;

const AGAVE_PERMISSION_CODES = {
    "READ_WRITE": PERMISSION_READ_WRITE,
    "READ": PERMISSION_READ_ONLY,
    "NONE": PERMISSION_NONE
};

module.exports = function(sequelize) {
    return {
        // Reusable sub-queries
        PROJECT_PERMISSION_ATTR: // Convert "permission" field to a string
            [ sequelize.literal(
                '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
                    'FROM project_to_user WHERE project_to_user.user_id = users.user_id AND project_to_user.project_id = project.project_id)'
              ),
              'permission'
            ],

        SAMPLE_PERMISSION_ATTR: // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
            [ sequelize.literal(
                '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
                    'FROM project_to_user WHERE project_to_user.user_id = `project->users`.`user_id` AND project_to_user.project_id = project.project_id)'
              ),
              'permission'
            ],

        PROJECT_GROUP_PERMISSION_ATTR: // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
            [ sequelize.literal(
                '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
                    'FROM project_group_to_user WHERE project_group_to_user.user_id = `project->project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
              ),
              'permission'
            ],

        PROJECT_GROUP_PERMISSION_ATTR2: // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
            [ sequelize.literal(
                '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
                    'FROM project_group_to_user WHERE project_group_to_user.user_id = `project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
              ),
              'permission'
            ],

        PROJECT_GROUP_PERMISSION_ATTR3: // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
            [ sequelize.literal(
                '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
                    'FROM project_group_to_user WHERE project_group_to_user.user_id = users.user_id AND project_group_to_user.project_group_id = project_group_id)'
              ),
              'permission'
            ],

        PROJECT_PERMISSION_CLAUSE: function(user) {
            return {
                $or: [
                    { private: { $or: [0, null] } },
                    (user && user.user_name ? sequelize.literal("users.user_name = '" + user.user_name + "'") : {}),
                    //(user && user.user_name ? sequelize.literal("`project_groups->users`.`user_id` = '" + user.user_id + "'") : {}) // not working
                ]
            };
        },

        // Permission codes -- in order of decreasing access rights
        PERMISSION_OWNER: PERMISSION_OWNER,
        PERMISSION_READ_WRITE: PERMISSION_READ_WRITE,
        PERMISSION_READ_ONLY: PERMISSION_READ_ONLY,
        PERMISSION_NONE: PERMISSION_NONE,

        PERMISSION_CODES: {
            "owner": PERMISSION_OWNER,
            "read-write": PERMISSION_READ_WRITE,
            "read-only": PERMISSION_READ_ONLY,
            "none": PERMISSION_NONE
        },

        checkProjectPermissions: function(projectId, user) {
            var self = this;

            return models.project.findOne({
                where: { project_id: projectId },
                include: [
                    { model: models.project_group
                    , attributes: [ 'project_group_id', 'group_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    , include: [
                        { model: models.user
                        , attributes: [ 'user_id', 'user_name',
                            [ sequelize.literal(
                                '(SELECT permission FROM project_group_to_user WHERE project_group_to_user.user_id = `project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
                              ),
                              'permission'
                            ]
                          ]
                        , through: { attributes: [] } // remove connector table from output
                        }
                      ]
                    },
                    { model: models.user
                    , attributes: [ 'user_id', 'user_name',
                        [ sequelize.literal(
                            '(SELECT permission FROM project_to_user WHERE project_to_user.user_id = users.user_id AND project_to_user.project_id = project.project_id)'
                          ),
                          'permission'
                        ]
                      ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
            .then( project => {
                if (!project)
                    throw(errors.ERR_NOT_FOUND);

                if (!project.private)
                    return PERMISSION_READ_ONLY;

                if (!user || !user.user_id)
                    throw(errors.ERR_PERMISSION_DENIED);

                var userPerm =
                    project.users &&
                        project.users
                        .filter(u => u.user_id == user.user_id)
                        .reduce((acc, u) => Math.min(u.get().permission, acc), self.PERMISSION_READ_ONLY);

                var groupPerm =
                    project.project_groups &&
                        project.project_groups
                        .reduce((acc, g) => acc.concat(g.users), [])
                        .filter(u => u.user_id == user.user_id)
                        .reduce((acc, u) => Math.min(u.get().permission, acc), self.PERMISSION_READ_ONLY);

                console.log("checkProjectPermissions: user permission =", userPerm, "group permission =", groupPerm);
                if (!userPerm && !groupPerm)
                    throw(errors.ERR_PERMISSION_DENIED);

                return Math.min(userPerm, groupPerm);
            });
        },

        checkSamplePermissions: function(sampleId, user) {
            var self = this;

            return models.sample.findOne({
                where: { sample_id: sampleId }
            })
            .then( sample => {
                if (!sample)
                    throw(errors.ERR_NOT_FOUND);

                return self.checkProjectPermissions(sample.project_id, user);
            });
        },

        requireProjectEditPermission: function(projectId, user) {
            var self = this;

            return self.checkProjectPermissions(projectId, user)
                .then( permission => {
                    if (permission >= self.PERMISSION_READ_ONLY)
                        throw(errors.ERR_PERMISSION_DENIED);

                    console.log("User " + user.user_name + "/" + user.user_id + " has edit access");
                    return permission;
                });
        },

        updateProjectFilePermissions: function(project_id, user_id, token, permission, files) {
            console.log("updateProjectFilePermissions", project_id, user_id, permission)
            return models.project.findOne({
                where: { project_id: project_id },
                include: [
                    { model: models.sample,
                      include: [ models.sample_file ]
                    }
                ]
            })
            .then( project => {
                return models.user.findOne({
                    where: { user_id: user_id }
                })
                .then( user => {
                    return {
                        user: user,
                        samples: project.samples
                    }
                })
            })
            .then( result => {
                var username = result.user.user_name;

                if (!files) { // use all project's sample files if none given
                    files = result.samples.reduce((acc, s) => acc.concat(s.sample_files), []);
                    files = files.map(f => f.file);
                }

                var agavePermission = toAgavePermission(permission);

                return agaveUpdateFilePermissions(username, token, agavePermission, files);
            });
        },

        updateSampleFilePermissions: function(sample_id, token, files) {
            var self = this;

            return models.sample.findOne({
                where: { sample_id: sample_id },
                include: [
                    { model: models.project
                    , include: [
                            { model: models.user
                            , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name' ]
                            , through: { attributes: [ 'permission' ] }
                            },
                            { model: models.project_group
                            , attributes: [ 'project_group_id', 'group_name' ]
                            , through: { attributes: [] } // remove connector table from output
                            , include: [
                                { model: models.user
                                , attributes: [ 'user_id', 'user_name' ]
                                , through: { attributes: [ 'permission' ] }
                                }
                              ]
                            }
                        ]
                    },
                    { model: models.sample_file
                    }
                ]
            })
            .then( sample => {
                if (!files) // use all sample files if none given
                    files = sample.sample_files.map(f => f.file);

                // Merge users from direct sharing and through groups, preventing duplicates
                var users = sample.project.users;
                var seen = users.reduce((map, user) => { map[user.user_id] = 1; return map; }, {});
                var allUsers = sample.project.project_groups
                    .reduce((acc, g) => acc.concat(g.users), [])
                    .reduce((acc, u) => {
                        if (!seen[u.user_id])
                            acc.push(u);
                        return acc;
                    }, []).concat(users);

                return Promise.all(
                    allUsers
                    .map(u => {
                        var permission = (u.project_to_user ? u.project_to_user.permission : u.project_group_to_user.permission);
                        var agavePermission = toAgavePermission(getKeyByValue(self.PERMISSION_CODES, permission));
                        return agaveUpdateFilePermissions(u.user_name, token, agavePermission, files);
                    })
                );
            });
        }
    };
};

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function agaveUpdateFilePermissions(username, token, permission, files) {
    return Promise.all(
        files.map(f => {
            return agaveGetFilePermissions(username, token, f)
                .then( curPermission => {
                    if (AGAVE_PERMISSION_CODES[curPermission] <= AGAVE_PERMISSION_CODES[permission]) {
                        console.log("No change to permission: ", username, curPermission, permission, f)
                        return; // only change permission if it expands access (e.g. from READ to READ_WRITE)
                    }

                    var url = config.agaveBaseUrl + "/files/v2/pems/system/data.iplantcollaborative.org" + f;
                    var options = {
                        method: "POST",
                        uri: url,
                        headers: {
                            Accept: "application/json" ,
                            Authorization: token
                        },
                        form: {
                            username: username,
                            permission: permission,
                            recursive: false
                        },
                        json: true
                    };

                    console.log("Sending POST", url, username, permission);
                    return requestp(options);
                });
//                      .catch(function (err) {
//                          console.error(err.message);
//                          res.status(500).send("Agave permissions request failed");
//                      });
        })
    );
}

function agaveGetFilePermissions(username, token, filepath) {
    var url = config.agaveBaseUrl + "/files/v2/pems/system/data.iplantcollaborative.org" + filepath;
    var options = {
        method: "GET",
        uri: url,
        headers: {
            Accept: "application/json" ,
            Authorization: token
        },
        form: {
            username: username,
            recursive: false
        },
        json: true
    };

    console.log("Sending GET", url, username);
    return requestp(options)
        .then(response => {
            if (response && response.result) {
                var user = response.result.find(user => user.username == username);
                if (user && user.permission) {
                    if (user.permission.write)
                        return "READ_WRITE";
                    if (user.permission.read)
                        return "READ";
                }
            }

            return "NONE";
        });
}

function toAgavePermission(perm) {
    if (perm) {
        switch (perm.toLowerCase()) {
            case "owner": return "ALL";
            case "read-only": return "READ";
            case "read-write": return "READ_WRITE";
        }
    }

    return "NONE";
}