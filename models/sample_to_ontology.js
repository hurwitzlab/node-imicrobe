/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_to_ontology', {
    sample_to_ontology_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'sample',
        key: 'sample_id'
      }
    },
    ontology_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'ontology',
        key: 'ontology_id'
      }
    }
  }, {
    tableName: 'sample_to_ontology'
  });
};
