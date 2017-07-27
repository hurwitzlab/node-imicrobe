/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('app_run', {
    app_run_id: {
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
    user_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'user',
        key: 'user_id'
      }
    },
    app_ran_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    params: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'app_run'
  });
};
