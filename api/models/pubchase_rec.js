/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pubchase_rec', {
    pubchase_rec_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    rec_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    checksum: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'pubchase_rec'
  });
};
