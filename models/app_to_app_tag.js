/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('app_to_app_tag', {
    app_to_app_tag_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    app_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'app',
        key: 'app_id'
      }
    },
    app_tag_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'app_tag',
        key: 'app_tag_id'
      }
    }
  }, {
    tableName: 'app_to_app_tag'
  });
};
