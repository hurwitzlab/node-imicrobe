'use strict';

var fs        = require("fs");
var path      = require("path");
var sequelize = require('../../config/mysql').sequelize;

/**
 * Import database model files
 */

var models = {};

fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return (file.split(".").pop() === 'js') && (file !== "index.js");
    })
    .forEach(function(file) {
        var model = sequelize.import(path.join(__dirname, file));
        models[model.name] = model;
    });

module.exports = models;

/**
 * Define table relationships (must be done manually, not auto-generated by sequelize-auto)
 */

// project <-> investigator
models.project.belongsToMany(models.investigator, { through: models.project_to_investigator, foreignKey: 'project_id' });
models.investigator.belongsToMany(models.project, { through: models.project_to_investigator, foreignKey: 'investigator_id' });

// project <-> project group
models.project.belongsToMany(models.project_group, { through: models.project_to_project_group, foreignKey: 'project_id' });
models.project_group.belongsToMany(models.project, { through: models.project_to_project_group, foreignKey: 'project_group_id' });

// project <-> domain
models.project.belongsToMany(models.domain, { through: models.project_to_domain, foreignKey: 'project_id' });
models.domain.belongsToMany(models.project, { through: models.project_to_domain, foreignKey: 'domain_id' });

// project <- publication
models.project.hasMany(models.publication, { foreignKey: 'project_id' });

// project <- assembly
models.project.hasMany(models.assembly, { foreignKey: 'project_id' });

// project <- combined_assembly
models.project.hasMany(models.combined_assembly, { foreignKey: 'project_id' });

// publication -> project
models.publication.belongsTo(models.project, { foreignKey: 'project_id' });

// assembly -> project
models.assembly.belongsTo(models.project, { foreignKey: 'project_id' });

// combined_assembly -> project
models.combined_assembly.belongsTo(models.project, { foreignKey: 'project_id' });

// project <- sample
models.project.hasMany(models.sample, { foreignKey: 'project_id' });

// sample -> project
models.sample.belongsTo(models.project, { foreignKey: 'project_id' });

// sample <-> investigator
models.sample.belongsToMany(models.investigator, { through: models.sample_to_investigator, foreignKey: 'sample_id' });
models.investigator.belongsToMany(models.sample, { through: models.sample_to_investigator, foreignKey: 'investigator_id' });

// sample <-> ontology
models.sample.belongsToMany(models.ontology, { through: models.sample_to_ontology, foreignKey: 'sample_id' });
models.ontology.belongsToMany(models.sample, { through: models.sample_to_ontology, foreignKey: 'ontology_id' });

// sample <-> combined_assembly
models.sample.belongsToMany(models.combined_assembly, { through: models.combined_assembly_to_sample, foreignKey: 'sample_id' });
models.combined_assembly.belongsToMany(models.sample, { through: models.combined_assembly_to_sample, foreignKey: 'combined_assembly_id' });

// sample <- sample_file
models.sample.hasMany(models.sample_file, { foreignKey: 'sample_id' });
models.sample_file.belongsTo(models.sample, { foreignKey: 'sample_id' });

// sample_file <- sample_file_type
models.sample_file.belongsTo(models.sample_file_type, { foreignKey: 'sample_file_type_id' });

// sample <- sample_attr
models.sample.hasMany(models.sample_attr, { foreignKey: 'sample_id' });
models.sample_attr.belongsTo(models.sample, { foreignKey: 'sample_id' });

// sample_attr -> sample_attr_type
models.sample_attr.belongsTo(models.sample_attr_type, { foreignKey: 'sample_attr_type_id' });

// sample_attr_type -> sample_attr_type_alias
models.sample_attr_type.hasMany(models.sample_attr_type_alias, { foreignKey: 'sample_attr_type_id' });

// app <- app_run
models.app.hasMany(models.app_run, { foreignKey: 'app_id' });
models.app_run.belongsTo(models.app, { foreignKey: 'app_id' });

// app <-> app_tag
models.app.belongsToMany(models.app_tag, { through: models.app_to_app_tag, foreignKey: 'app_id' });
models.app_tag.belongsToMany(models.app, { through: models.app_to_app_tag, foreignKey: 'app_tag_id' });

// app <-> app_data_type
models.app.belongsToMany(models.app_data_type, { through: models.app_to_app_data_type, foreignKey: 'app_id' });
models.app_data_type.belongsToMany(models.app, { through: models.app_to_app_data_type, foreignKey: 'app_data_type_id' });