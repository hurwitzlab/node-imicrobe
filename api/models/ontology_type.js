/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('ontology_type', {
    ontology_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING(256),
      allowNull: true,
      unique: true
    },
    url_template: {
      type: DataTypes.STRING(256),
      allowNull: true
    }
  }, {
    tableName: 'ontology_type'
  });
};
