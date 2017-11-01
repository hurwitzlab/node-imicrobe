/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample', {
    sample_id: {
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
    combined_assembly_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'combined_assembly',
        key: 'combined_assembly_id'
      }
    },
    sample_acc: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sample_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sample_type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sample_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    taxon_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    latitude: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    longitude: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'sample'
  });
};
