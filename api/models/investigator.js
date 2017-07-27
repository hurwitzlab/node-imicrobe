/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('investigator', {
    investigator_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    investigator_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    institution: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    }
  }, {
    tableName: 'investigator'
  });
};
