/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('combined_assembly', {
    combined_assembly_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'project',
        key: 'project_id'
      }
    },
    assembly_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    phylum: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    class: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    family: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    genus: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    species: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    strain: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pcr_amp: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    annotations_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    peptides_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    nucleotides_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    cds_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'combined_assembly'
  });
};
