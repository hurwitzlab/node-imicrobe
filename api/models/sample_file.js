/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_file', {
    sample_file_id: {
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
    sample_file_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'sample_file_type',
        key: 'sample_file_type_id'
      }
    },
    file: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    num_seqs: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    num_bp: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    avg_len: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    pct_gc: {
      type: "DOUBLE",
      allowNull: true
    }
  }, {
    tableName: 'sample_file'
  });
};
