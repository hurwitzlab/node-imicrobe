/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_attr_type_alias', {
    sample_attr_type_alias_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_attr_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'sample_attr_type',
        key: 'sample_attr_type_id'
      }
    },
    alias: {
      type: DataTypes.STRING(200),
      allowNull: false
    }
  }, {
    tableName: 'sample_attr_type_alias'
  });
};
