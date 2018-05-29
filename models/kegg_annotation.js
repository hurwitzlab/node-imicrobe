/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('kegg_annotation', {
    kegg_annotation_id: {
      type: DataTypes.STRING(16),
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    definition: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    pathway: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    module: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'kegg_annotation'
  });
};
