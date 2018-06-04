/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('query_log', {
    query_log_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    num_found: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    params: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ip: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    user_id: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    time: {
      type: "DOUBLE",
      allowNull: true
    },
    date: {
      type: DataTypes.TIME,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    tableName: 'query_log'
  });
};
