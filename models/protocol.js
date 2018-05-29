/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('protocol', {
    protocol_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    protocol_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'protocol'
  });
};
