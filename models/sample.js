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
    sample_acc: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sample_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    sample_type: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    sample_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    creation_date: {
      type: DataTypes.TIME,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    tableName: 'sample'
  });
};
