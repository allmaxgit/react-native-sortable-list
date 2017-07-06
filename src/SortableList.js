import React, {Component, PropTypes} from 'react';
import {ScrollView, View, StyleSheet, Platform, RefreshControl, Dimensions} from 'react-native';
import {shallowEqual, swapArrayElements} from './utils';
import Row from './Row';

const { width, height } = Dimensions.get('window');

const AUTOSCROLL_INTERVAL = 100;
const ZINDEX = Platform.OS === 'ios' ? 'zIndex' : 'elevation';

function uniqueRowKey(key) {
  return `${key}${uniqueRowKey.id}`
}

uniqueRowKey.id = 0;

export default class SortableList extends Component {
  static propTypes = {
    data: PropTypes.object.isRequired,
    order: PropTypes.arrayOf(PropTypes.any),
    style: View.propTypes.style,
    contentContainerStyle: View.propTypes.style,
    sortingEnabled: PropTypes.bool,
    scrollEnabled: PropTypes.bool,
    horizontal: PropTypes.bool,
    refreshControl: PropTypes.element,

    renderRow: PropTypes.func.isRequired,
    renderFooter: PropTypes.func,

    shouldActivateRow: PropTypes.func,
    onChangeOrder: PropTypes.func,
    onActivateRow: PropTypes.func,
    onReleaseRow: PropTypes.func,
    autoscrollAreaSize: PropTypes.number,
    onPressRow: PropTypes.func
  };

  static defaultProps = {
    sortingEnabled: true,
    scrollEnabled: true,
    autoscrollAreaSize: 60,
    shouldActivateRow: () => true
  };

  /**
   * Stores refs to rows’ components by keys.
   */
  _rows = {};
  rowWidthHack = (width < height ? width : height) - (70 * (width / 750));
  rowHeightHack = 150 * (width / 750);
  /**
   * Stores promises of rows’ layouts.
   */
  _rowsLayouts = [];

  _contentOffset = {x: 0, y: 0};

  state = {
    animated: false,
    order: this.props.order || Object.keys(this.props.data),
    rowsLayouts: null,
    containerLayout: null,
    data: this.props.data,
    activeRowKey: null,
    activeRowIndex: null,
    releasedRowKey: null,
    sortingEnabled: this.props.sortingEnabled,
    scrollEnabled: this.props.scrollEnabled
  };

  componentDidMount() {
    this._onUpdateLayouts();
  }

  componentWillReceiveProps(nextProps) {
    const {data, order} = this.state;
    const {data: nextData, order: nextOrder} = nextProps;

    if (data && nextData && !shallowEqual(data, nextData)) {
      uniqueRowKey.id++;
      this._rowsLayouts = [];
      this.setState({
        animated: false,
        data: nextData,
        containerLayout: null,
        rowsLayouts: null,
        order: nextOrder || Object.keys(nextData)
      });

    } else if (order && nextOrder && !shallowEqual(order, nextOrder)) {
      this.setState({order: nextOrder});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const {data} = this.state;
    const {data: prevData} = prevState;

    if (data && prevData && !shallowEqual(data, prevData)) {
      this._onUpdateLayouts();
    }
  }

  scrollBy({dx = 0, dy = 0, animated = false}) {
    if (this.props.horizontal) {
      this._contentOffset.x += dx;
    } else {
      this._contentOffset.y += dy;
    }

    this._scroll(animated);
  }

  scrollTo({x = 0, y = 0, animated = false}) {
    if (this.props.horizontal) {
      this._contentOffset.x = x;
    } else {
      this._contentOffset.y = y;
    }

    this._scroll(animated);
  }

  scrollToRowKey({key, animated = false}) {
    const {order, containerLayout, rowsLayouts} = this.state;

    let keyX = 0;
    let keyY = 0;

    for (const rowKey of order) {
      if (rowKey === key) {
        break;
      }

      keyX += rowsLayouts[rowKey].width;
      keyY += rowsLayouts[rowKey].height;
    }

    // Scroll if the row is not visible.
    if (
      this.props.horizontal
        ? (keyX < this._contentOffset.x || keyX > this._contentOffset.x + containerLayout.width)
        : (keyY < this._contentOffset.y || keyY > this._contentOffset.y + containerLayout.height)
    ) {
      if (this.props.horizontal) {
        this._contentOffset.x = keyX;
      } else {
        this._contentOffset.y = keyY;
      }

      this._scroll(animated);
    }
  }

  render() {
    const {contentContainerStyle, horizontal, style} = this.props;
    const {animated, contentHeight, contentWidth, scrollEnabled} = this.state;
    const containerStyle = StyleSheet.flatten([style, {opacity: Number(animated)}])
    const innerContainerStyle = [styles.rowsContainer];
    let {refreshControl} = this.props;

    if (horizontal) {
      innerContainerStyle.push({width: contentWidth});
    } else {
      innerContainerStyle.push({height: contentHeight});
    }

    if (refreshControl && refreshControl.type === RefreshControl) {
      refreshControl = React.cloneElement(this.props.refreshControl, {
        enabled: scrollEnabled, // fix for Android
      });
    }

    return (
      <View style={containerStyle} ref={this._onRefContainer}>
        <ScrollView
          refreshControl={refreshControl}
          ref={this._onRefScrollView}
          horizontal={horizontal}
          contentContainerStyle={contentContainerStyle}
          scrollEventThrottle={2}
          scrollEnabled={scrollEnabled}
          onScroll={this._onScroll}>
          <View style={innerContainerStyle}>
            {this._renderRows()}
          </View>
          {this._renderFooter()}
        </ScrollView>
      </View>
    );
  }

  _renderRows() {
    const {horizontal, sortingEnabled, renderRow} = this.props;
    const {animated, order, data, activeRowKey, releasedRowKey, rowsLayouts} = this.state;

    let rowHeight = 0;
    let rowWidth = 0;

    if (rowsLayouts) {
      Object.keys(rowsLayouts).forEach((key) => {
        rowHeight = Math.max(rowHeight, this.rowHeightHack);
        rowWidth = Math.max(rowWidth, this.rowWidthHack);
      });
    }

    let nextX = 0;
    let nextY = 0;

    this._rowsLayouts = []

    return order.map((key, index) => {
      const style = {[ZINDEX]: 0};
      const location = {x: 0, y: 0};
      let resolveLayout;

      if (rowsLayouts) {
        if (horizontal) {
          style.height = rowHeight;
          location.x = nextX;
          nextX += this.rowWidthHack;
        } else {
          style.width = rowWidth;
          location.y = nextY;
          nextY += this.rowHeightHack;
        }
      } else {
        this._rowsLayouts.push(new Promise((resolve) => (resolve(resolveLayout = resolve))));
      }

      const active = activeRowKey === key;
      const released = releasedRowKey === key;

      if (active || released) {
        style[ZINDEX] = 100;
      }

      return (
        <Row
          key={uniqueRowKey(key)}
          ref={this._onRefRow.bind(this, key)}
          horizontal={horizontal}
          animated={animated && !active}
          disabled={!sortingEnabled}
          style={style}
          location={location}
          onLayout={!rowsLayouts ? this._onLayoutRow.bind(this, resolveLayout, key) : null}
          shouldActivate={this._shouldActivateRow.bind(this, key)}
          onActivate={this._onActivateRow.bind(this, key, index)}
          onPress={this._onPressRow.bind(this, key)}
          onRelease={this._onReleaseRow.bind(this, key)}
          onMove={this._onMoveRow}>
          {renderRow({
            key,
            data: data[key],
            disabled: !sortingEnabled,
            active,
            index,
          })}
        </Row>
      );
    });
  }

  _renderFooter() {
    if (!this.props.renderFooter || this.props.horizontal) {
      return null;
    }

    const {footerLayout} = this.state;
    let resolveLayout;

    if (!footerLayout) {
      this._footerLayout = new Promise((resolve) => (resolveLayout = resolve));
    }

    return (
      <View onLayout={!footerLayout ? this._onLayoutFooter.bind(this, resolveLayout) : null}>
        {this.props.renderFooter()}
      </View>
    );
  }

  _onUpdateLayouts() {
    Promise.all([...this._rowsLayouts])
      .then(([...rowsLayouts]) => {
        // Can get correct container’s layout only after rows’s layouts.
        this._container.measure((x, y, width, height, pageX, pageY) => {
          const rowsLayoutsByKey = {};
          let contentHeight = 0;
          let contentWidth = 0;

          rowsLayouts.forEach(({rowKey, layout}) => {
            rowsLayoutsByKey[rowKey] = {y: 0, x: 0, width: this.rowWidthHack, height: this.rowHeightHack};
            contentHeight += this.rowHeightHack;
            contentWidth += this.rowWidthHack;
          });

          this.setState({
            containerLayout: {x, y, width, height, pageX, pageY},
            rowsLayouts: rowsLayoutsByKey,
            // footerLayout,
            contentHeight,
            contentWidth,
          }, () => {
            this.setState({animated: true});
          });
        });
      });
  }

  _scroll(animated) {
    this._scrollView.scrollTo({...this._contentOffset, animated});
  }

  /**
   * Finds a row under the moving row, if they are neighbours,
   * swaps them, else shifts rows.
   */
  _setOrderOnMove() {
    const {activeRowKey, activeRowIndex, order} = this.state;

    if (activeRowKey === null || this._autoScrollInterval) {
      return;
    }

    let {
      rowKey: rowUnderActiveKey,
      rowIndex: rowUnderActiveIndex,
    } = this._findRowUnderActiveRow();

    if (this._movingDirectionChanged) {
      this._prevSwapedRowKey = null;
    }

    // Swap rows if necessary.
    if (rowUnderActiveKey !== activeRowKey && rowUnderActiveKey !== this._prevSwapedRowKey) {
      const isNeighbours = Math.abs(rowUnderActiveIndex - activeRowIndex) === 1;
      let nextOrder;

      // If they are neighbours, swap elements, else shift.
      if (isNeighbours) {
        this._prevSwapedRowKey = rowUnderActiveKey;
        nextOrder = swapArrayElements(order, activeRowIndex, rowUnderActiveIndex);
      } else {
        nextOrder = order.slice();
        nextOrder.splice(activeRowIndex, 1);
        nextOrder.splice(rowUnderActiveIndex, 0, activeRowKey);
      }

      this.setState({
        order: nextOrder,
        activeRowIndex: rowUnderActiveIndex,
      }, () => {
        if (this.props.onChangeOrder) {
          this.props.onChangeOrder(nextOrder);
        }
      });
    }
  }

  /**
   * Finds a row, which was covered with the moving row’s half.
   */
  _findRowUnderActiveRow() {
    const {horizontal} = this.props;
    const {rowsLayouts, activeRowKey, activeRowIndex, order} = this.state;
    const movingRowLayout = rowsLayouts[activeRowKey];
    const rowLeftX = this._activeRowLocation.x
    const rowRightX = rowLeftX + this.rowWidthHack;
    const rowTopY = this._activeRowLocation.y;
    const rowBottomY = rowTopY + this.rowHeightHack;

    for (
      let currentRowIndex = 0, x = 0, y = 0, rowsCount = order.length;
      currentRowIndex < rowsCount - 1;
      currentRowIndex++
    ) {
      const currentRowKey = order[currentRowIndex];
      const currentRowLayout = rowsLayouts[currentRowKey];
      const nextRowIndex = currentRowIndex + 1;
      const nextRowLayout = rowsLayouts[order[nextRowIndex]];

      x += this.rowWidthHack;
      y += this.rowHeightHack;

      if (currentRowKey !== activeRowKey && (
          horizontal
            ? ((x - this.rowWidthHack <= rowLeftX || currentRowIndex === 0) && rowLeftX <= x - this.rowWidthHack / 3)
            : ((y - this.rowHeightHack <= rowTopY || currentRowIndex === 0) && rowTopY <= y - this.rowHeightHack / 3)
        )) {
        return {
          rowKey: order[currentRowIndex],
          rowIndex: currentRowIndex,
        };
      }

      if (horizontal
          ? (x + this.rowWidthHack / 3 <= rowRightX && (rowRightX <= x + this.rowWidthHack || nextRowIndex === rowsCount - 1))
          : (y + this.rowHeightHack / 3 <= rowBottomY && (rowBottomY <= y + this.rowHeightHack || nextRowIndex === rowsCount - 1))
      ) {
        return {
          rowKey: order[nextRowIndex],
          rowIndex: nextRowIndex,
        };
      }
    }

    return {rowKey: activeRowKey, rowIndex: activeRowIndex};
  }

  _scrollOnMove(e) {
    const {pageX, pageY} = e.nativeEvent;
    const {horizontal} = this.props;
    const {containerLayout} = this.state;
    let inAutoScrollBeginArea = false;
    let inAutoScrollEndArea = false;

    if (horizontal) {
      inAutoScrollBeginArea = pageX < containerLayout.pageX + this.props.autoscrollAreaSize;
      inAutoScrollEndArea = pageX > containerLayout.pageX + containerLayout.width - this.props.autoscrollAreaSize;
    } else {
      inAutoScrollBeginArea = pageY < 120;
      inAutoScrollEndArea = pageY > 508;
    }

    if (!inAutoScrollBeginArea &&
      !inAutoScrollEndArea &&
      this._autoScrollInterval !== null
    ) {
      this._stopAutoScroll();
    }

    // It should scroll and scrolling is processing.
    if (this._autoScrollInterval !== null) {
      return;
    }

    if (inAutoScrollBeginArea) {
      this._startAutoScroll({
        direction: -1,
        shouldScroll: () => this._contentOffset[horizontal ? 'x' : 'y'] > 0,
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const contentOffset = this._contentOffset[horizontal ? 'x' : 'y'];

          return contentOffset - nextStep < 0 ? contentOffset : nextStep;
        },
      });
    } else if (inAutoScrollEndArea) {
      this._startAutoScroll({
        direction: 1,
        shouldScroll: () => {
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          let containerLayoutHack = height - 68 > (this.rowHeightHack + 1) * this.state.order.length ?
            (this.rowHeightHack + 1) * this.state.order.length : height - 68

          if (horizontal) {
            return this._contentOffset.x < contentWidth - containerLayout.width
          } else {
            return this._contentOffset.y < contentHeight  - containerLayoutHack;
          }
        },
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          let containerLayoutHack = height - 68 > (this.rowHeightHack + 1) * this.state.order.length ?
            (this.rowHeightHack + 1) * this.state.order.length : height - 68

          if (horizontal) {
            return this._contentOffset.x + nextStep > contentWidth - containerLayout.width
              ? contentWidth - containerLayout.width - this._contentOffset.x
              : nextStep;
          } else {
            const scrollHeight = contentHeight - containerLayoutHack;

            return this._contentOffset.y + nextStep > scrollHeight
              ? scrollHeight - this._contentOffset.y
              : nextStep;
          }
        },
      });
    }
  }

  _getScrollStep(stepIndex) {
    return stepIndex > 3 ? 60 : 30;
  }

  _startAutoScroll({direction, shouldScroll, getScrollStep}) {
    if (!shouldScroll()) {
      return;
    }

    const {activeRowKey} = this.state;
    const {horizontal} = this.props;
    let counter = 0;

    this._autoScrollInterval = setInterval(() => {
      if (shouldScroll()) {
        const movement = {
          [horizontal ? 'dx' : 'dy']: direction * getScrollStep(counter++),
        };

        this.scrollBy(movement);
        this._rows[activeRowKey].moveBy(movement);
      } else {
        this._stopAutoScroll();
      }
    }, AUTOSCROLL_INTERVAL);
  }

  _stopAutoScroll() {
    clearInterval(this._autoScrollInterval);
    this._autoScrollInterval = null;
  }

  _onLayoutRow(resolveLayout, rowKey, {nativeEvent: {layout}}) {
    resolveLayout({rowKey, layout});
  }

  _onLayoutFooter(resolveLayout, {nativeEvent: {layout}}) {
    resolveLayout(layout);
  }

  _shouldActivateRow = (rowKey) => {
    if (this.props.shouldActivateRow) {
      return this.props.shouldActivateRow(rowKey);
    }
    return true;
  };

  _onActivateRow = (rowKey, index, e, gestureState, location) => {
    this._activeRowLocation = location;

    this.setState({
      activeRowKey: rowKey,
      activeRowIndex: index,
      releasedRowKey: null,
      scrollEnabled: false,
    });

    if (this.props.onActivateRow) {
      this.props.onActivateRow(rowKey);
    }
  };

  _onPressRow = (rowKey) => {
    if (this.props.onPressRow) {
      this.props.onPressRow(rowKey);
    }
  };

  _onReleaseRow = (rowKey) => {
    this._stopAutoScroll();
    this.setState(({activeRowKey}) => ({
      activeRowKey: null,
      activeRowIndex: null,
      releasedRowKey: activeRowKey,
      scrollEnabled: this.props.scrollEnabled,
    }));

    if (this.props.onReleaseRow) {
      this.props.onReleaseRow(rowKey);
    }
  };

  _onMoveRow = (e, gestureState, location) => {
    const prevMovingRowX = this._activeRowLocation.x;
    const prevMovingRowY = this._activeRowLocation.y;
    const prevMovingDirection = this._movingDirection;

    this._activeRowLocation = location;
    this._movingDirection = this.props.horizontal
      ? prevMovingRowX < this._activeRowLocation.x
      : prevMovingRowY < this._activeRowLocation.y;

    this._movingDirectionChanged = prevMovingDirection !== this._movingDirection;
    this._setOrderOnMove();

    if (this.props.scrollEnabled) {
      this._scrollOnMove(e);
    }
  };

  _onScroll = ({nativeEvent: {contentOffset}}) => {
    this._contentOffset = contentOffset;
  };

  _onRefContainer = (component) => {
    this._container = component;
  };

  _onRefScrollView = (component) => {
    this._scrollView = component;
  };

  _onRefRow = (rowKey, component) => {
    this._rows[rowKey] = component;
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  rowsContainer: {
    flex: 1,
    zIndex: 1,
  },
});
