/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('uproc_pfam_result', {
    sample_to_uproc_id: {
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
    uproc_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'pfam_annotation',
        key: 'uproc_id'
      }
    },
    read_count: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    }
  }, {
    tableName: 'uproc_pfam_result'
  });
};
