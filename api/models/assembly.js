/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('assembly', {
    assembly_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'project',
        key: 'project_id'
      }
    },
    assembly_code: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    assembly_name: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    organism: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pep_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    nt_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    cds_file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'sample',
        key: 'sample_id'
      }
    }
  }, {
    tableName: 'assembly'
  });
};
