/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('search', {
    search_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    table_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    primary_key: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true
    },
    search_text: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'search'
  });
};
