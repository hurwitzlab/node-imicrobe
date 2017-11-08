/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('uproc_kegg_result', {
    uproc_kegg_result_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'sample',
        key: 'sample_id'
      }
    },
    kegg_annotation_id: {
      type: DataTypes.STRING(16),
      allowNull: false,
      references: {
        model: 'kegg_annotation',
        key: 'kegg_annotation_id'
      }
    },
    read_count: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    }
  }, {
    tableName: 'uproc_kegg_result'
  });
};
