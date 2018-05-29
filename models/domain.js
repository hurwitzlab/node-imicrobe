/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('domain', {
    domain_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    domain_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'domain'
  });
};
