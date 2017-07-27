/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_file_type', {
    sample_file_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: 'sample_file_type'
  });
};
