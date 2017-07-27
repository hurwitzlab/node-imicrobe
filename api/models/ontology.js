/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('ontology', {
    ontology_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    ontology_acc: {
      type: DataTypes.STRING(125),
      allowNull: false
    },
    label: {
      type: DataTypes.STRING(125),
      allowNull: false
    },
    ontology_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'ontology_type',
        key: 'ontology_type_id'
      }
    }
  }, {
    tableName: 'ontology'
  });
};
